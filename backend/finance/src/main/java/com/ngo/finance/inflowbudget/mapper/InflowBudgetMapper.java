package com.ngo.finance.inflowbudget.mapper;

import com.ngo.finance.donor.FundingClassifier;
import com.ngo.finance.donor.entity.DonorDisbursementRule;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.DonorTrancheCriterion;
import com.ngo.finance.donor.entity.ForeignAmount;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.inflowbudget.dto.response.InflowBudgetLineResponse;
import com.ngo.finance.programme.entity.Programme;
import com.ngo.finance.transaction.entity.CreditNote;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Builds an {@link InflowBudgetLineResponse} from a donor tranche criterion,
 * deriving the funding source, donor name, book and a human-readable line
 * description from its disbursement rule / fund profile / donor chain, plus
 * what was received — the credit notes received against the line.
 */
@Component
public class InflowBudgetMapper {

    private static final Comparator<CreditNote> OLDEST_FIRST =
            Comparator.comparing(CreditNote::getNoteDate).thenComparing(CreditNote::getNoteCode);

    public InflowBudgetLineResponse toResponse(DonorTrancheCriterion criterion, List<CreditNote> creditNotes) {
        DonorDisbursementRule rule = criterion.getDonorDisbursementRule();
        DonorFundProfile profile = rule.getFundProfile();
        DonorMaster donor = profile.getDonor();

        List<CreditNote> received = creditNotes.stream().sorted(OLDEST_FIRST).toList();
        BigDecimal actualAmount = received.stream()
                .map(CreditNote::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        LocalDate actualDate = received.isEmpty() ? null : received.get(received.size() - 1).getNoteDate();

        return InflowBudgetLineResponse.builder()
                .id(criterion.getId())
                .trancheCode(criterion.getTrancheCode())
                .fundProfileId(profile.getId())
                .profileCode(profile.getProfileCode())
                .fcraApplicable(donor.getFcraApplicable())
                .foreign(foreignInfo(criterion, rule))
                .line(buildLine(criterion, profile))
                .fundingSource(profile.getFundMode() != null ? profile.getFundMode().name() : FundMode.RESTRICTED.name())
                .donor(donor.getDonorName())
                .book(resolveBook(donor))
                .expectedDate(criterion.getExpectedReleaseDate())
                .expectedAmount(criterion.getAmountCriteria())
                .actualDate(actualDate)
                .actualAmount(received.isEmpty() ? null : actualAmount)
                .receiptRef(joinDetail(received, CreditNote::getReference))
                .receiptNo(joinDetail(received, CreditNote::getNoteCode))
                .receipts(received.stream()
                        .map(n -> InflowBudgetLineResponse.ReceiptItem.builder()
                                .date(n.getNoteDate())
                                .amount(n.getAmount())
                                .reference(n.getReference())
                                .creditNoteId(n.getNoteCode())
                                .build())
                        .toList())
                .build();
    }

    /** Joins each instalment's non-blank value, oldest first, for display — "; "-joined. */
    private String joinDetail(List<CreditNote> received, java.util.function.Function<CreditNote, String> field) {
        String joined = received.stream()
                .map(field)
                .filter(value -> value != null && !value.isBlank())
                .reduce((a, b) -> a + "; " + b)
                .orElse(null);
        return joined;
    }

    /**
     * The FC side of the line, or null for an INR commitment. A lump sum's single
     * tranche may carry no foreign amount of its own; it is the whole commitment.
     */
    private InflowBudgetLineResponse.ForeignInfo foreignInfo(DonorTrancheCriterion criterion,
            DonorDisbursementRule rule) {
        ForeignAmount fc = rule.getForeignContribution();
        if (fc == null) {
            return null;
        }
        BigDecimal expected = criterion.getForeignAmount() != null
                ? criterion.getForeignAmount()
                : rule.getDonorTrancheCriteria().size() == 1 ? fc.getForeignAmount() : null;
        return InflowBudgetLineResponse.ForeignInfo.builder()
                .currency(fc.getCurrency())
                .expectedForeignAmount(expected)
                .commitmentForeignAmount(fc.getForeignAmount())
                .commitmentInrAmount(rule.getTotalAmount())
                .fxRate(fc.getFxRate())
                .fxRateDate(fc.getFxRateDate())
                .fxRateSource(fc.getFxRateSource() != null ? fc.getFxRateSource().name() : null)
                .fxRateSourceLabel(fc.getFxRateSource() != null ? fc.getFxRateSource().getLabel() : null)
                .build();
    }

    private String buildLine(DonorTrancheCriterion criterion, DonorFundProfile profile) {
        Programme programme = profile.getProgramme();
        String subject = programme != null ? programme.getProgrammeName() : profile.getDonor().getDonorName();
        return Boolean.TRUE.equals(criterion.getIsFinalTranche())
                ? "Final tranche — " + subject
                : "Grant tranche — " + subject;
    }

    private String resolveBook(DonorMaster donor) {
        return FundingClassifier.bookOf(donor).getShortName();
    }
}
