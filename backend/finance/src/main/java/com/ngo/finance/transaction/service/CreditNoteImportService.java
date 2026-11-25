package com.ngo.finance.transaction.service;

import static com.ngo.finance.transaction.service.ImportSupport.*;

import com.ngo.finance.bankDetails.entity.BankDetail;
import com.ngo.finance.bankDetails.repository.BankDetailRepository;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.donor.FundingClassifier;
import com.ngo.finance.donor.entity.DonorDisbursementRule;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.DonorTrancheCriterion;
import com.ngo.finance.donor.entity.ForeignAmount;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.donor.repository.DonorFundProfileRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.repository.GrantRepository;
import com.ngo.finance.inflowbudget.dto.response.InflowBudgetLineResponse;
import com.ngo.finance.inflowbudget.repository.InflowBudgetLineRepository;
import com.ngo.finance.inflowbudget.service.InflowBudgetService;
import com.ngo.finance.outflow.dto.RefDto;
import com.ngo.finance.paymentMode.entity.PaymentMode;
import com.ngo.finance.paymentMode.repository.PaymentModeRepository;
import com.ngo.finance.transaction.dto.request.CreateCreditNoteRequest;
import com.ngo.finance.transaction.dto.request.CreditNoteImportRequest;
import com.ngo.finance.transaction.dto.request.CreditNoteImportRequest.Row;
import com.ngo.finance.transaction.dto.response.CreditNoteImportResponse;
import com.ngo.finance.transaction.dto.response.CreditNoteImportResponse.RowResult;
import com.ngo.finance.transaction.dto.response.CreditNoteImportResponse.Status;
import com.ngo.finance.transaction.dto.response.NoteResponse;
import com.ngo.finance.transaction.entity.CreditNote;
import com.ngo.finance.transaction.repository.CreditNoteRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Credit notes from a CSV file. Every row is checked the way the New Credit
 * Note form checks it — codes resolved, the fund belongs to the donor, a
 * tranched fund names its tranche, FC amounts add up — and reported per row.
 * Valid rows are then saved through CreditNoteService, in one transaction.
 *
 * Rows with errors are never saved. A row that looks like an existing note (or
 * an earlier row in the file) — same date, amount and reference — is flagged
 * and saved only when the user explicitly selects it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CreditNoteImportService {

    private static final BigDecimal ONE_RUPEE = BigDecimal.ONE;

    private final CreditNoteService creditNoteService;
    private final CreditNoteRepository creditNoteRepository;
    private final PaymentModeRepository paymentModeRepository;
    private final BankDetailRepository bankDetailRepository;
    private final DonorRepository donorRepository;
    private final DonorFundProfileRepository fundProfileRepository;
    private final GrantRepository grantRepository;
    private final InflowBudgetLineRepository trancheRepository;
    private final InflowBudgetService inflowBudgetService;

    /** A row checked against the data: the request it becomes (when valid) and what to report. */
    private record Checked(RowResult result, CreateCreditNoteRequest request) {
    }

    @Transactional
    public CreditNoteImportResponse importNotes(CreditNoteImportRequest request) {
        List<PaymentMode> paymentModes = paymentModeRepository.findAll().stream()
                .filter(m -> !Boolean.FALSE.equals(m.getStatus()))
                .toList();
        List<BankDetail> bankAccounts = bankDetailRepository.findAll().stream()
                .filter(b -> !Boolean.FALSE.equals(b.getStatus()))
                .toList();

        List<Checked> checked = new ArrayList<>();
        Set<String> seenInFile = new HashSet<>();
        java.util.Map<String, Integer> tallyInFile = new java.util.HashMap<>();
        for (Row row : request.getRows()) {
            Checked c = check(row, request.getActor(), paymentModes, bankAccounts);
            // One Tally voucher → one credit note: already imported, or twice in this file, is an error.
            String tallyNo = blank(row.getTallyVoucherNo()) ? null : row.getTallyVoucherNo().trim();
            if (tallyNo != null) {
                String tallyType = blank(row.getTallyVoucherType()) ? "" : row.getTallyVoucherType().trim();
                String label = CreditNoteService.tallyLabel(tallyType, tallyNo);
                Integer earlier = tallyInFile.putIfAbsent((tallyType + "|" + tallyNo).toUpperCase(), row.getRowNumber());
                creditNoteRepository.findByTallyVoucher(tallyType, tallyNo).ifPresentOrElse(
                        existing -> c.result().getErrors().add("Tally voucher " + label + " is already imported as " + existing.getNoteCode()),
                        () -> {
                            if (earlier != null) {
                                c.result().getErrors().add("Tally voucher " + label + " is also on row " + earlier + " of this file");
                            }
                        });
            }
            if (c.request() != null && c.result().getErrors().isEmpty()) {
                String key = duplicateKey(c.request().getDate(), c.request().getAmount(), c.request().getReference());
                boolean dupInFile = !seenInFile.add(key);
                boolean dupExisting = existsAlready(c.request());
                if (dupInFile || dupExisting) {
                    c.result().setDuplicate(true);
                    c.result().getWarnings().add(dupExisting
                            ? "Possible duplicate: a credit note with this date, amount and reference already exists"
                            : "Possible duplicate: an earlier row in this file has the same date, amount and reference");
                }
            }
            c.result().setStatus(!c.result().getErrors().isEmpty() ? Status.ERROR
                    : !c.result().getWarnings().isEmpty() ? Status.WARNING : Status.READY);
            checked.add(c);
        }

        int created = 0;
        if (!request.isDryRun()) {
            Set<Integer> selected = request.getSelected() == null ? null : new HashSet<>(request.getSelected());
            for (Checked c : checked) {
                RowResult r = c.result();
                if (r.getStatus() == Status.ERROR) {
                    continue;
                }
                boolean wanted = selected != null ? selected.contains(r.getRowNumber()) : !r.isDuplicate();
                if (!wanted) {
                    r.setStatus(Status.SKIPPED);
                    continue;
                }
                NoteResponse note = creditNoteService.createCreditNote(c.request());
                r.setNoteCode(note.getId());
                r.setStatus(Status.IMPORTED);
                created++;
            }
            log.info("Credit note import: {} of {} rows imported", created, checked.size());
        }

        return CreditNoteImportResponse.builder()
                .dryRun(request.isDryRun())
                .createdCount(created)
                .rows(checked.stream().map(Checked::result).toList())
                .build();
    }

    // ── One row ───────────────────────────────────────────────────────────────

    private Checked check(Row row, String actor, List<PaymentMode> paymentModes, List<BankDetail> bankAccounts) {
        RowResult result = RowResult.builder().rowNumber(row.getRowNumber()).build();
        List<String> errors = result.getErrors();

        LocalDate date = parseDate(row.getDate(), errors);
        ContributionType book = parseBook(row.getBook(), errors);

        PaymentMode mode = null;
        if (blank(row.getReceivedVia())) {
            errors.add("received_via is required (a payment mode, e.g. NEFT)");
        } else {
            mode = paymentModes.stream().filter(m -> m.getName().equalsIgnoreCase(row.getReceivedVia().trim()))
                    .findFirst().orElse(null);
            if (mode == null) {
                errors.add("received_via \"" + row.getReceivedVia().trim() + "\" is not an active payment mode");
            } else {
                result.setReceivedVia(mode.getName());
            }
        }

        BankDetail bank = blank(row.getBankAccount()) ? null : matchBank(row.getBankAccount(), book, bankAccounts, errors);

        // Donor → fund profile → tranche
        DonorMaster donor = null;
        if (!blank(row.getDonorCode())) {
            donor = donorRepository.findByDonorCode(row.getDonorCode().trim()).orElse(null);
            if (donor == null) {
                errors.add("donor_code " + row.getDonorCode().trim() + " not found");
            }
        }
        DonorFundProfile fund = null;
        if (!blank(row.getFundProfileCode())) {
            fund = fundProfileRepository.findByProfileCode(row.getFundProfileCode().trim().toUpperCase(Locale.ROOT))
                    .orElse(null);
            if (fund == null) {
                errors.add("fund_profile_code " + row.getFundProfileCode().trim() + " not found");
            } else if (donor != null && !Objects.equals(fund.getDonor().getId(), donor.getId())) {
                errors.add("fund_profile_code " + fund.getProfileCode() + " belongs to "
                        + fund.getDonor().getDonorName() + ", not " + donor.getDonorName());
            } else if (donor == null && blank(row.getDonorCode())) {
                donor = fund.getDonor(); // the fund names its donor
            }
        } else if (donor != null) {
            errors.add("fund_profile_code is required when a donor is given");
        }
        if (donor != null && book != null && FundingClassifier.bookOf(donor) != book) {
            errors.add("Donor " + donor.getDonorName() + " is on the " + FundingClassifier.bookOf(donor).getShortName()
                    + " book, not " + book.getShortName());
        }
        if (donor != null) {
            result.setDonorName(donor.getDonorName());
        }

        DonorDisbursementRule rule = fund == null ? null : fund.getDisbursementRules().stream().findFirst().orElse(null);
        boolean tranched = rule != null && rule.getDisbursementType() == DisbursementType.TRANCHES;
        DonorTrancheCriterion tranche = null;
        if (fund != null) {
            result.setFundProfileCode(fund.getProfileCode());
            if (tranched) {
                if (blank(row.getTrancheCode())) {
                    errors.add("tranche_code is required — " + fund.getProfileCode() + " is paid in tranches");
                } else {
                    tranche = trancheRepository.findByTrancheCode(row.getTrancheCode().trim().toUpperCase(Locale.ROOT))
                            .orElse(null);
                    if (tranche == null || tranche.getDonorDisbursementRule().getFundProfile() == null
                            || !Objects.equals(tranche.getDonorDisbursementRule().getFundProfile().getId(), fund.getId())) {
                        errors.add("tranche_code " + row.getTrancheCode().trim() + " is not a tranche of " + fund.getProfileCode());
                        tranche = null;
                    } else {
                        result.setTrancheCode(tranche.getTrancheCode());
                    }
                }
            } else if (rule != null && !rule.getDonorTrancheCriteria().isEmpty()) {
                // A lump sum is one tranche on the server; its line is what the money counts against.
                tranche = rule.getDonorTrancheCriteria().get(0);
            }
        } else if (!blank(row.getTrancheCode())) {
            errors.add("tranche_code needs a fund_profile_code");
        }

        // Amount: INR, or foreign amount × rate for an FC fund
        ForeignAmount fc = rule == null ? null : rule.getForeignContribution();
        BigDecimal amountInr = blank(row.getAmountInr()) ? null : parseAmount("amount_inr", row.getAmountInr(), errors);
        String currency = null;
        BigDecimal foreignAmount = null;
        BigDecimal fxRate = null;
        boolean fcGiven = !blank(row.getCurrency()) || !blank(row.getForeignAmount()) || !blank(row.getFxRate());
        if (fc != null || (fcGiven && book == ContributionType.FC)) {
            currency = blank(row.getCurrency()) ? (fc != null ? fc.getCurrency() : null) : row.getCurrency().trim().toUpperCase(Locale.ROOT);
            foreignAmount = blank(row.getForeignAmount()) ? null : parseAmount("foreign_amount", row.getForeignAmount(), errors);
            fxRate = blank(row.getFxRate()) ? null : parseAmount("fx_rate", row.getFxRate(), errors);
            if (currency == null) {
                errors.add("currency is required for a foreign-currency receipt");
            } else if (fc != null && !currency.equals(fc.getCurrency())) {
                errors.add("currency " + currency + " doesn't match the fund's " + fc.getCurrency());
            }
            if (blank(row.getForeignAmount())) {
                errors.add("foreign_amount is required — " + (fc != null ? fund.getProfileCode() + " is an FC fund" : "a currency is given"));
            }
            if (blank(row.getFxRate())) {
                errors.add("fx_rate is required — the rate the bank converted at");
            }
            if (foreignAmount != null && fxRate != null) {
                BigDecimal product = foreignAmount.multiply(fxRate).setScale(2, RoundingMode.HALF_UP);
                if (amountInr == null) {
                    amountInr = product;
                } else if (amountInr.subtract(product).abs().compareTo(ONE_RUPEE) > 0) {
                    errors.add("amount_inr " + inr(amountInr) + " ≠ foreign_amount × fx_rate = " + inr(product));
                }
            }
        } else if (fcGiven) {
            errors.add("currency / foreign_amount / fx_rate are only for FC receipts");
        }
        if (amountInr == null && errors.stream().noneMatch(e -> e.startsWith("amount_inr") || e.startsWith("foreign_amount") || e.startsWith("fx_rate"))) {
            errors.add("amount_inr is required");
        } else if (amountInr != null && amountInr.signum() <= 0) {
            errors.add("amount_inr must be greater than 0");
        }

        result.setTallyVoucher(checkTallyVoucher(row.getTallyVoucherType(), row.getTallyVoucherNo(), errors));

        result.setDate(date);
        result.setBook(book != null ? book.getShortName() : null);
        result.setAmount(amountInr);
        result.setCurrency(currency);
        result.setForeignAmount(foreignAmount);

        if (!errors.isEmpty()) {
            return new Checked(result, null);
        }

        // More than is still outstanding on the line? A warning, not an error.
        if (tranche != null && tranche.getId() != null) {
            try {
                InflowBudgetLineResponse line = inflowBudgetService.getLineById(tranche.getId());
                BigDecimal outstanding = line.getExpectedAmount()
                        .subtract(line.getActualAmount() == null ? BigDecimal.ZERO : line.getActualAmount());
                if (amountInr.compareTo(outstanding) > 0) {
                    result.getWarnings().add("More than the " + inr(outstanding.max(BigDecimal.ZERO))
                            + " still outstanding on " + (tranched ? tranche.getTrancheCode() : "this lump sum"));
                }
            } catch (RuntimeException e) {
                log.debug("No inflow line for tranche {}: {}", tranche.getId(), e.getMessage());
            }
        }

        String remarks = blank(row.getRemarks()) ? "Imported from CSV" : row.getRemarks().trim() + " (imported from CSV)";
        CreateCreditNoteRequest note = CreateCreditNoteRequest.builder()
                .date(date)
                .amount(amountInr)
                .book(book)
                .paymentMode(RefDto.of(String.valueOf(mode.getId()), mode.getName()))
                .bankAccount(bank == null ? null : RefDto.of(String.valueOf(bank.getId()), bankLabel(bank)))
                .donor(donor == null ? null : RefDto.of(String.valueOf(donor.getId()), donor.getDonorName()))
                .fundProfile(fund == null ? null : RefDto.of(String.valueOf(fund.getId()), fundLabel(fund)))
                .grant(fund == null ? null : grantRepository.findByFundProfileId(fund.getId()).stream().findFirst()
                        .map(g -> RefDto.of(String.valueOf(g.getId()), g.getGrantCode())).orElse(null))
                .disbursementType(fund == null ? null : tranched ? "Tranches" : "Lump Sum")
                .tranche(tranched && tranche != null ? RefDto.of(String.valueOf(tranche.getId()), trancheLabel(tranche, fc)) : null)
                .reference(blank(row.getReference()) ? null : row.getReference().trim())
                .tallyVoucherType(blank(row.getTallyVoucherType()) ? null : row.getTallyVoucherType().trim())
                .tallyVoucherNo(blank(row.getTallyVoucherNo()) ? null : row.getTallyVoucherNo().trim())
                .remarks(remarks)
                .currency(currency)
                .foreignAmount(currency != null ? foreignAmount : null)
                .fxRate(currency != null ? fxRate : null)
                .actor(actor)
                .build();
        return new Checked(result, note);
    }

    // ── Matching and parsing ──────────────────────────────────────────────────

    private boolean existsAlready(CreateCreditNoteRequest note) {
        String ref = norm(note.getReference());
        for (CreditNote existing : creditNoteRepository.findByNoteDateAndAmount(note.getDate(), note.getAmount())) {
            if (norm(existing.getReference()).equals(ref)) {
                return true;
            }
        }
        return false;
    }

    private static String trancheLabel(DonorTrancheCriterion t, ForeignAmount fc) {
        String amount = fc != null && t.getForeignAmount() != null
                ? fc.getCurrency() + " " + grouped(t.getForeignAmount(), false) + " (" + inr(t.getAmountCriteria()) + ")"
                : inr(t.getAmountCriteria());
        return t.getTrancheCode() + (Boolean.TRUE.equals(t.getIsFinalTranche()) ? " (final)" : "") + " — " + amount;
    }

}
