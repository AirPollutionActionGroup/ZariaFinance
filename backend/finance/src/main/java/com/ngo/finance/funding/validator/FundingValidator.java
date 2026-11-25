package com.ngo.finance.funding.validator;

import com.ngo.finance.donor.enums.FundClass;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.DisbursementRuleItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.TrancheCriterionItem;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.GrantAgreement;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.donor.repository.CityRepository;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.transaction.entity.CreditNote;
import com.ngo.finance.transaction.repository.CreditNoteRepository;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.funding.dto.FundingRequest.AgreementPart;
import com.ngo.finance.programme.entity.Programme;
import com.ngo.finance.programme.repository.ProgrammeRepository;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The /funding form's cross-field rules, checked on the server so they hold
 * however the API is called. Per-field shape rules (required fields, release
 * criteria, the FC block's arithmetic) stay on the fund profile request's own
 * validator (@ValidFundProfile) and run first through @Valid.
 *
 * All problems are collected and thrown together as one ValidationException,
 * keyed by request path, so the form can mark every field at once.
 */
@Component
public class FundingValidator {

    @Autowired
    private ProgrammeRepository programmeRepository;

    @Autowired
    private CityRepository cityRepository;

    @Autowired
    private CreditNoteRepository creditNoteRepository;

    /**
     * @param existingGrant the agreement already on this record, or null (create,
     *                      or editing terms that have no agreement yet)
     * @param creating      true for a new record
     */
    public void validate(FundingRequest request, DonorMaster donor, GrantAgreement existingGrant, boolean creating) {
        Map<String, String> errors = new LinkedHashMap<>();
        validateTerms(request.getTerms(), donor, creating, errors);
        if (request.getAgreement() != null) {
            validateAgreement(request.getAgreement(), existingGrant, errors);
        }
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed for one or more fields", errors);
        }
    }

    /**
     * An edit may not remove a tranche that money was received against: credit
     * notes point at tranches by id, and removing one would orphan them (and
     * drop "received" to zero). Tranches are kept by sending their id.
     */
    public void validateTrancheRemovals(DonorFundProfile profile, CreateFundProfileRequest terms) {
        Set<Long> kept = new java.util.HashSet<>();
        if (terms.getDisbursementRules() != null) {
            for (DisbursementRuleItem rule : terms.getDisbursementRules()) {
                if (rule.getTrancheCriteria() == null) {
                    continue;
                }
                for (TrancheCriterionItem tranche : rule.getTrancheCriteria()) {
                    if (tranche.getId() != null) {
                        kept.add(tranche.getId());
                    }
                }
            }
        }
        Map<String, String> removedCodeById = new LinkedHashMap<>();
        profile.getDisbursementRules().forEach(rule -> rule.getDonorTrancheCriteria().forEach(t -> {
            if (t.getId() != null && !kept.contains(t.getId())) {
                removedCodeById.put(String.valueOf(t.getId()), t.getTrancheCode());
            }
        }));
        if (removedCodeById.isEmpty()) {
            return;
        }
        List<CreditNote> received = creditNoteRepository.findByTrancheRefIn(removedCodeById.keySet());
        if (received.isEmpty()) {
            return;
        }
        Map<String, List<String>> notesByTranche = new LinkedHashMap<>();
        for (CreditNote note : received) {
            notesByTranche.computeIfAbsent(removedCodeById.get(note.getTrancheRef()), k -> new java.util.ArrayList<>())
                    .add(note.getNoteCode());
        }
        String detail = notesByTranche.entrySet().stream()
                .map(e -> e.getKey() + " (" + String.join(", ", e.getValue()) + ")")
                .collect(java.util.stream.Collectors.joining("; "));
        Map<String, String> errors = new LinkedHashMap<>();
        errors.put("terms.disbursementRules.0.trancheCriteria",
                "Money has been received against " + detail
                        + " — a tranche with credit notes can't be removed. Change its amount or date instead.");
        throw new ValidationException("Validation failed for one or more fields", errors);
    }

    private void validateTerms(CreateFundProfileRequest terms, DonorMaster donor, boolean creating,
            Map<String, String> errors) {
        // Fund mode decides programme-tied and the class.
        if (terms.getFundMode() == FundMode.RESTRICTED) {
            if (!Boolean.TRUE.equals(terms.getProgrammeTied())) {
                errors.put("terms.programmeTied", "A restricted fund must be programme-tied");
            }
            if (terms.getFundClass() != null && terms.getFundClass() != FundClass.CLASS_A_RESTRICTED) {
                errors.put("terms.fundClass", "A restricted fund must be Class A");
            }
        } else if (terms.getFundMode() == FundMode.UNRESTRICTED) {
            if (Boolean.TRUE.equals(terms.getProgrammeTied())) {
                errors.put("terms.programmeTied", "An unrestricted fund can't be programme-tied");
            }
            if (terms.getFundClass() == FundClass.CLASS_A_RESTRICTED) {
                errors.put("terms.fundClass", "An unrestricted fund must be Class B or Class C");
            }
        }

        validateGeographies(terms, errors);

        List<DisbursementRuleItem> rules = terms.getDisbursementRules() == null ? List.of() : terms.getDisbursementRules();
        for (int d = 0; d < rules.size(); d++) {
            DisbursementRuleItem rule = rules.get(d);
            String path = "terms.disbursementRules." + d;
            List<TrancheCriterionItem> tranches = rule.getTrancheCriteria() == null ? List.of() : rule.getTrancheCriteria();

            // A lump sum is one tranche on the wire; it carries the release criteria.
            if (rule.getDisbursementType() == DisbursementType.LUMP_SUM && tranches.isEmpty()) {
                errors.put(path + ".trancheCriteria", "A lump sum needs at least one release criterion");
            }

            // Tranches can't add up to more than what is committed.
            if (rule.getTotalAmount() != null) {
                BigDecimal allocated = tranches.stream()
                        .map(TrancheCriterionItem::getAmountCriteria)
                        .filter(Objects::nonNull)
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                if (allocated.compareTo(rule.getTotalAmount()) > 0) {
                    errors.putIfAbsent(path + ".trancheCriteria", "Tranches add up to ₹" + allocated.toPlainString()
                            + ", more than the ₹" + rule.getTotalAmount().toPlainString() + " committed");
                }
            }

            // New FC-book funding is entered in the donor's currency. (Older
            // records saved before the FC fields existed can still be edited.)
            // A domestic donor's commitment is always in INR.
            boolean foreignDonor = donor.getFundSourceDomicile() == FundSourceDomicile.FOREIGN;
            if (creating && foreignDonor && rule.getCurrency() == null) {
                errors.put(path + ".currency",
                        "This donor is in the FC book — enter the currency, foreign amount and FX rate");
            }
            if (!foreignDonor && (rule.getCurrency() != null || rule.getForeignAmount() != null
                    || rule.getFxRate() != null)) {
                errors.put(path + ".currency", "Foreign currency is only for donors in the FC book");
            }
        }
    }

    /**
     * Spendable states must fall within the linked programme / project's states:
     * the project's own states, else its parent programme's, else any state.
     */
    private void validateGeographies(CreateFundProfileRequest terms, Map<String, String> errors) {
        if (terms.getGeographies() == null || terms.getGeographies().isEmpty()) {
            return;
        }
        validateCities(terms, errors);
        if (terms.getProgrammeId() == null) {
            return;
        }
        Set<Long> allowed = allowedStates(terms.getProgrammeId());
        if (allowed.isEmpty()) {
            return;
        }
        boolean outside = terms.getGeographies().stream()
                .anyMatch(g -> g.getStateId() != null && !allowed.contains(g.getStateId()));
        if (outside) {
            errors.put("terms.geographies", "Pick only states the selected programme / project works in");
        }
    }

    /**
     * A geography is a whole state (no city) or one city in a state: each city
     * must be in its row's state, and a state is either whole or listed by
     * city — not both.
     */
    private void validateCities(CreateFundProfileRequest terms, Map<String, String> errors) {
        Set<Long> wholeStates = new java.util.HashSet<>();
        Set<Long> statesWithCities = new java.util.HashSet<>();
        for (CreateFundProfileRequest.GeographyItem g : terms.getGeographies()) {
            if (g.getStateId() == null) {
                continue; // @NotNull reports it
            }
            if (g.getCityId() == null) {
                wholeStates.add(g.getStateId());
                continue;
            }
            statesWithCities.add(g.getStateId());
            Long cityState = cityRepository.findById(g.getCityId())
                    .map(city -> city.getDistrict() != null && city.getDistrict().getState() != null
                            ? city.getDistrict().getState().getId() : null)
                    .orElse(null);
            if (!g.getStateId().equals(cityState)) {
                errors.put("terms.geographies", "A selected city is not in the state it was picked under");
                return;
            }
        }
        wholeStates.retainAll(statesWithCities);
        if (!wholeStates.isEmpty()) {
            errors.put("terms.geographies", "A state is either allowed whole or by city — not both");
        }
    }

    private Set<Long> allowedStates(Long programmeId) {
        Programme selected = programmeRepository.findById(programmeId).orElse(null);
        if (selected == null) {
            return Set.of(); // an unknown id is reported as "not found" by the profile service
        }
        if (selected.getStateIds() != null && !selected.getStateIds().isEmpty()) {
            return selected.getStateIds();
        }
        if (selected.getParentProgrammeId() != null) {
            return programmeRepository.findById(selected.getParentProgrammeId())
                    .map(Programme::getStateIds)
                    .filter(ids -> ids != null)
                    .orElse(Set.of());
        }
        return Set.of();
    }

    private void validateAgreement(AgreementPart agreement, GrantAgreement existingGrant, Map<String, String> errors) {
        if (agreement.getStartDate() != null && agreement.getEndDate() != null
                && agreement.getEndDate().isBefore(agreement.getStartDate())) {
            errors.put("agreement.endDate", "End date must be on or after the start date");
        }
        boolean hasDocument = agreement.getAgreementDocumentPath() != null
                && !agreement.getAgreementDocumentPath().isBlank();
        boolean hadDocument = existingGrant != null && existingGrant.getAgreementDocumentPath() != null
                && !existingGrant.getAgreementDocumentPath().isBlank();
        if (!hasDocument && !hadDocument) {
            errors.put("agreement.agreementDocumentPath", "The signed agreement document is required");
        }
    }
}
