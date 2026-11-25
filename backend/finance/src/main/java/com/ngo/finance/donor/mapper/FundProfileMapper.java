package com.ngo.finance.donor.mapper;

import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.entity.DonorDisbursementRule;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.donor.entity.DonorReleaseCriteria;
import com.ngo.finance.donor.entity.DonorTrancheCriterion;
import com.ngo.finance.donor.entity.DonorUtilisationRule;
import com.ngo.finance.donor.entity.ForeignAmount;
import com.ngo.finance.donor.enums.ScheduleType;
import com.ngo.finance.donor.entity.CityMaster;
import com.ngo.finance.donor.entity.SpendableGeography;
import com.ngo.finance.donor.entity.StateMaster;
import com.ngo.finance.donor.repository.CityRepository;
import com.ngo.finance.donor.repository.StateRepository;
import com.ngo.finance.masters.designation.entity.Designation;
import com.ngo.finance.masters.designation.repository.DesignationRepository;
import com.ngo.finance.programme.entity.Programme;
import com.ngo.finance.programme.repository.ProgrammeRepository;
import java.math.BigDecimal;
import java.util.Comparator;
import java.util.Map;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Mapper for Donor Fund Profile ↔ DTOs.
 *
 * Hand-written (not MapStruct) because the profile owns three child collections
 * with parent back-references — clearer and less error-prone here than generated
 * mapping. The donor and programme associations are resolved in the service
 * (they need repository lookups) and are not touched here; geography's stateId
 * is resolved right here instead, since it sits inside a growing/shrinking list
 * rather than a single FK on the parent.
 */
@Component
public class FundProfileMapper {

    @Autowired
    private StateRepository stateRepository;

    @Autowired
    private CityRepository cityRepository;

    @Autowired
    private DesignationRepository designationRepository;

    @Autowired
    private ProgrammeRepository programmeRepository;

    private Designation resolveDesignation(Long id) {
        if (id == null) {
            return null;
        }
        return designationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Designation", id));
    }

    /** Build a new entity graph from the request. Donor & programme set by the service. */
    public DonorFundProfile toEntity(CreateFundProfileRequest request) {
        DonorFundProfile profile = DonorFundProfile.builder()
                .fundMode(request.getFundMode())
                .fundClass(request.getFundClass())
                .purpose(request.getPurpose())
                // The on/off flags are NOT NULL; a flag left out of the JSON is off
                // (@Builder.Default doesn't apply to deserialised requests).
                .programmeTied(Boolean.TRUE.equals(request.getProgrammeTied()))
                .reportingFrequency(request.getReportingFrequency())
                .movementAllowed(Boolean.TRUE.equals(request.getMovementAllowed()))
                .explanationRequired(Boolean.TRUE.equals(request.getExplanationRequired()))
                .onboardingComplete(Boolean.TRUE.equals(request.getOnboardingComplete()))
                .build();
        applyChildren(request, profile);
        return profile;
    }

    /**
     * Update an existing entity's scalar fields and its children. Geographies and
     * utilisation rules are replaced; disbursement rules and their tranches are
     * merged by id, so a tranche that is kept keeps its id and code — credit notes
     * point at tranches by id (credit_note.tranche_ref).
     */
    public void updateEntity(CreateFundProfileRequest request, DonorFundProfile profile) {
        profile.setFundMode(request.getFundMode());
        profile.setFundClass(request.getFundClass());
        profile.setPurpose(request.getPurpose());
        profile.setProgrammeTied(Boolean.TRUE.equals(request.getProgrammeTied()));
        profile.setReportingFrequency(request.getReportingFrequency());
        profile.setMovementAllowed(Boolean.TRUE.equals(request.getMovementAllowed()));
        profile.setExplanationRequired(Boolean.TRUE.equals(request.getExplanationRequired()));
        profile.setOnboardingComplete(Boolean.TRUE.equals(request.getOnboardingComplete()));

        // orphanRemoval deletes the rows dropped from these lists.
        profile.getGeographies().clear();
        profile.getUtilisationRules().clear();
        applyChildren(request, profile);
    }

    private void applyChildren(CreateFundProfileRequest request, DonorFundProfile profile) {
        if (request.getGeographies() != null) {
            for (CreateFundProfileRequest.GeographyItem g : request.getGeographies()) {
                StateMaster state = stateRepository.findById(g.getStateId())
                        .orElseThrow(() -> new ResourceNotFoundException("State", g.getStateId()));
                CityMaster city = g.getCityId() == null ? null : cityRepository.findById(g.getCityId())
                        .orElseThrow(() -> new ResourceNotFoundException("City", g.getCityId()));
                profile.getGeographies().add(SpendableGeography.builder()
                        .fundProfile(profile)
                        .state(state)
                        .city(city)
                        .build());
            }
        }
        if (request.getUtilisationRules() != null) {
            for (CreateFundProfileRequest.UtilisationRuleItem u : request.getUtilisationRules()) {
                profile.getUtilisationRules().add(DonorUtilisationRule.builder()
                        .fundProfile(profile)
                        .ruleType(u.getRuleType())
                        .otherRuleType(u.getOtherRuleType())
                        .limitPercentage(u.getLimitPercentage())
                        .description(u.getDescription())
                        .build());
            }
        }
        mergeDisbursementRules(request, profile);
    }

    /**
     * Rules and tranches sent with an id that the profile already has are
     * updated in place; ones without an id (or an unknown one) are added; the
     * profile's ones not sent are removed. New tranches get their code from
     * DonorFundProfile.assignTrancheCodes once the profile code is known.
     */
    private void mergeDisbursementRules(CreateFundProfileRequest request, DonorFundProfile profile) {
        List<CreateFundProfileRequest.DisbursementRuleItem> items =
                request.getDisbursementRules() == null ? List.of() : request.getDisbursementRules();
        Map<Long, DonorDisbursementRule> existing = new HashMap<>();
        for (DonorDisbursementRule rule : profile.getDisbursementRules()) {
            if (rule.getId() != null) {
                existing.put(rule.getId(), rule);
            }
        }

        List<DonorDisbursementRule> kept = new ArrayList<>();
        for (CreateFundProfileRequest.DisbursementRuleItem d : items) {
            DonorDisbursementRule rule = d.getId() != null ? existing.get(d.getId()) : null;
            if (rule == null) {
                rule = DonorDisbursementRule.builder().fundProfile(profile).build();
            }
            rule.setTotalAmount(d.getTotalAmount());
            rule.setDisbursementType(d.getDisbursementType());
            rule.setReceivingDate(d.getReceivingDate());
            rule.setForeignContribution(toForeignAmount(d));
            mergeTranches(d, rule);
            kept.add(rule);
        }

        profile.getDisbursementRules().removeIf(rule -> kept.stream().noneMatch(k -> k == rule));
        for (DonorDisbursementRule rule : kept) {
            if (profile.getDisbursementRules().stream().noneMatch(r -> r == rule)) {
                profile.getDisbursementRules().add(rule);
            }
        }
    }

    private void mergeTranches(CreateFundProfileRequest.DisbursementRuleItem d, DonorDisbursementRule rule) {
        boolean foreign = rule.getForeignContribution() != null;
        Map<Long, DonorTrancheCriterion> existing = new HashMap<>();
        for (DonorTrancheCriterion tranche : rule.getDonorTrancheCriteria()) {
            if (tranche.getId() != null) {
                existing.put(tranche.getId(), tranche);
            }
        }

        List<DonorTrancheCriterion> kept = new ArrayList<>();
        List<CreateFundProfileRequest.TrancheCriterionItem> items =
                d.getTrancheCriteria() == null ? List.of() : d.getTrancheCriteria();
        for (CreateFundProfileRequest.TrancheCriterionItem c : items) {
            DonorTrancheCriterion criterion = c.getId() != null ? existing.get(c.getId()) : null;
            if (criterion == null) {
                criterion = new DonorTrancheCriterion();
                criterion.setDonorDisbursementRule(rule);
            }
            criterion.setAmountCriteria(c.getAmountCriteria());
            // A foreign tranche amount only means something on an FC commitment.
            criterion.setForeignAmount(foreign ? c.getForeignAmount() : null);
            criterion.setExpectedReleaseDate(c.getExpectedReleaseDate());
            // frequency is optional on the wire; @Builder.Default doesn't apply when
            // the request comes from JSON, so default it here (column is NOT NULL).
            criterion.setFrequency(c.getFrequency() != null ? c.getFrequency() : ScheduleType.MONTHLY);
            criterion.setIsFinalTranche(c.getIsFinalTranche());

            // Release criteria have no outside references: replace them.
            criterion.getDonorReleaseCriteria().clear();
            if (c.getCriteria() != null) {
                for (CreateFundProfileRequest.ReleaseCriterionItem rc : c.getCriteria()) {
                    criterion.getDonorReleaseCriteria().add(toReleaseCriteria(rc, criterion));
                }
            }
            kept.add(criterion);
        }

        rule.getDonorTrancheCriteria().removeIf(t -> kept.stream().noneMatch(k -> k == t));
        for (DonorTrancheCriterion tranche : kept) {
            if (rule.getDonorTrancheCriteria().stream().noneMatch(t -> t == tranche)) {
                rule.getDonorTrancheCriteria().add(tranche);
            }
        }
    }

    private DonorReleaseCriteria toReleaseCriteria(CreateFundProfileRequest.ReleaseCriterionItem rc,
            DonorTrancheCriterion criterion) {
        DonorReleaseCriteria releaseCriteria = new DonorReleaseCriteria();
        releaseCriteria.setDonorTrancheCriterion(criterion);
        releaseCriteria.setReleaseCriteria(rc.getReleaseCriteria());
        releaseCriteria.setReleaseDate(rc.getReleaseDate());
        releaseCriteria.setMilestoneName(rc.getMilestoneName());
        releaseCriteria.setVerificationSignOffRole(resolveDesignation(rc.getVerificationSignOffRoleId()));
        releaseCriteria.setOtherVerificationSignOffRole(rc.getOtherVerificationSignOffRole());
        releaseCriteria.setTargetDate(rc.getTargetDate());
        releaseCriteria.setUtilisationPercentage(rc.getUtilisationPercentage());
        releaseCriteria.setTriggerBasis(rc.getTriggerBasis());
        releaseCriteria.setDescription(rc.getDescription());
        releaseCriteria.setRemindSomeone(rc.getRemindSomeone());
        releaseCriteria.setResponsibleRole(resolveDesignation(rc.getResponsibleRoleId()));
        releaseCriteria.setOtherResponsibleRole(rc.getOtherResponsibleRole());
        releaseCriteria.setReminderLeadTime(rc.getReminderLeadTime());
        releaseCriteria.setRepeatReminder(rc.getRepeatReminder());
        releaseCriteria.setEscalateToDeputy(rc.getEscalateToDeputy());
        return releaseCriteria;
    }

    /**
     * The FC block as one value, or null for an INR commitment. Null when no FC
     * field is sent; when only some are, the validator has already rejected it.
     */
    private ForeignAmount toForeignAmount(CreateFundProfileRequest.DisbursementRuleItem d) {
        if (d.getCurrency() == null && d.getForeignAmount() == null && d.getFxRate() == null
                && d.getFxRateDate() == null && d.getFxRateSource() == null) {
            return null;
        }
        return ForeignAmount.builder()
                .currency(d.getCurrency() != null ? d.getCurrency().trim().toUpperCase() : null)
                .foreignAmount(d.getForeignAmount())
                .fxRate(d.getFxRate())
                .fxRateDate(d.getFxRateDate())
                .fxRateSource(d.getFxRateSource())
                .build();
    }

    public FundProfileResponse toResponse(DonorFundProfile p) {
        List<FundProfileResponse.GeographyItem> geos = p.getGeographies().stream()
                .map(g -> FundProfileResponse.GeographyItem.builder()
                        .id(g.getId())
                        .stateId(g.getState() != null ? g.getState().getId() : null)
                        .stateName(g.getState() != null ? g.getState().getStateName() : null)
                        .stateCode(g.getState() != null ? g.getState().getStateCode() : null)
                        .cityId(g.getCity() != null ? g.getCity().getId() : null)
                        .cityName(g.getCity() != null ? g.getCity().getCityName() : null)
                        .build())
                .toList();

        List<FundProfileResponse.UtilisationRuleItem> utils = p.getUtilisationRules().stream()
                .map(u -> FundProfileResponse.UtilisationRuleItem.builder()
                        .id(u.getId())
                        .ruleType(u.getRuleType() != null ? u.getRuleType().name() : null)
                        .ruleTypeLabel(u.getRuleType() != null ? u.getRuleType().getLabel() : null)
                        .otherRuleType(u.getOtherRuleType())
                        .limitPercentage(u.getLimitPercentage())
                        .description(u.getDescription())
                        .build())
                .toList();

        List<FundProfileResponse.DisbursementRuleItem> disbs = p.getDisbursementRules().stream()
                .map(this::toDisbursementRuleItem)
                .toList();

        Long parentProgrammeId = null;
        String parentProgrammeName = null;
        if (p.getProgramme() != null && p.getProgramme().getParentProgrammeId() != null) {
            Programme parent = programmeRepository.findById(p.getProgramme().getParentProgrammeId()).orElse(null);
            if (parent != null) {
                parentProgrammeId = parent.getId();
                parentProgrammeName = parent.getProgrammeName();
            }
        }

        return FundProfileResponse.builder()
                .id(p.getId())
                .profileCode(p.getProfileCode())
                .donorId(p.getDonor() != null ? p.getDonor().getId() : null)
                .donorName(p.getDonor() != null ? p.getDonor().getDonorName() : null)
                .fundMode(p.getFundMode() != null ? p.getFundMode().name() : null)
                .fundClass(p.getFundClass() != null ? p.getFundClass().name() : null)
                .fundClassLabel(p.getFundClass() != null ? p.getFundClass().getLabel() : null)
                .purpose(p.getPurpose())
                .programmeTied(p.getProgrammeTied())
                .programmeId(p.getProgramme() != null ? p.getProgramme().getId() : null)
                .programmeName(p.getProgramme() != null ? p.getProgramme().getProgrammeName() : null)
                .programmeType(p.getProgramme() != null ? p.getProgramme().getType() : null)
                .parentProgrammeId(parentProgrammeId)
                .parentProgrammeName(parentProgrammeName)
                .reportingFrequency(p.getReportingFrequency() != null ? p.getReportingFrequency().name() : null)
                .reportingFrequencyLabel(
                        p.getReportingFrequency() != null ? p.getReportingFrequency().getLabel() : null)
                .movementAllowed(p.getMovementAllowed())
                .explanationRequired(p.getExplanationRequired())
                .onboardingComplete(p.getOnboardingComplete())
                .geographies(geos)
                .utilisationRules(utils)
                .disbursementRules(disbs)
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }

    private FundProfileResponse.DisbursementRuleItem toDisbursementRuleItem(DonorDisbursementRule d) {
        List<FundProfileResponse.TrancheCriterionItem> criteria = d.getDonorTrancheCriteria().stream()
                .sorted(Comparator.comparing(DonorTrancheCriterion::getExpectedReleaseDate,
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(DonorTrancheCriterion::getId,
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .map(this::toTrancheCriterionItem)
                .toList();

        BigDecimal allocated = criteria.stream()
                .map(FundProfileResponse.TrancheCriterionItem::getAmountCriteria)
                .filter(java.util.Objects::nonNull)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal unallocated = d.getTotalAmount() != null ? d.getTotalAmount().subtract(allocated) : null;

        ForeignAmount fc = d.getForeignContribution();
        return FundProfileResponse.DisbursementRuleItem.builder()
                .id(d.getId())
                .totalAmount(d.getTotalAmount())
                .disbursementType(d.getDisbursementType() != null ? d.getDisbursementType().name() : null)
                .disbursementTypeLabel(
                        d.getDisbursementType() != null ? d.getDisbursementType().getLabel() : null)
                .receivingDate(d.getReceivingDate())
                .foreign(fc != null)
                .currency(fc != null ? fc.getCurrency() : null)
                .foreignAmount(fc != null ? fc.getForeignAmount() : null)
                .fxRate(fc != null ? fc.getFxRate() : null)
                .fxRateDate(fc != null ? fc.getFxRateDate() : null)
                .fxRateSource(fc != null && fc.getFxRateSource() != null ? fc.getFxRateSource().name() : null)
                .fxRateSourceLabel(fc != null && fc.getFxRateSource() != null ? fc.getFxRateSource().getLabel() : null)
                .trancheCriteria(criteria)
                .allocatedAmount(allocated)
                .unallocatedAmount(unallocated)
                .balanced(unallocated != null && unallocated.signum() == 0)
                .build();
    }

    private FundProfileResponse.TrancheCriterionItem toTrancheCriterionItem(DonorTrancheCriterion c) {
        List<FundProfileResponse.ReleaseCriterionItem> criteria = c.getDonorReleaseCriteria().stream()
                .map(this::toReleaseCriterionItem)
                .toList();

        return FundProfileResponse.TrancheCriterionItem.builder()
                .id(c.getId())
                .trancheCode(c.getTrancheCode())
                .amountCriteria(c.getAmountCriteria())
                .foreignAmount(c.getForeignAmount())
                .expectedReleaseDate(c.getExpectedReleaseDate())
                .frequency(c.getFrequency() != null ? c.getFrequency().name() : null)
                .frequencyLabel(c.getFrequency() != null ? c.getFrequency().getLabel() : null)
                .isFinalTranche(c.getIsFinalTranche())
                .criteria(criteria)
                .build();
    }

    private FundProfileResponse.ReleaseCriterionItem toReleaseCriterionItem(DonorReleaseCriteria rc) {
        return FundProfileResponse.ReleaseCriterionItem.builder()
                .id(rc.getId())
                .releaseCriteria(rc.getReleaseCriteria() != null ? rc.getReleaseCriteria().name() : null)
                .releaseCriteriaLabel(rc.getReleaseCriteria() != null ? rc.getReleaseCriteria().getLabel() : null)
                .releaseDate(rc.getReleaseDate())
                .milestoneName(rc.getMilestoneName())
                .verificationSignOffRoleId(
                        rc.getVerificationSignOffRole() != null ? rc.getVerificationSignOffRole().getId() : null)
                .verificationSignOffRoleLabel(
                        rc.getVerificationSignOffRole() != null ? rc.getVerificationSignOffRole().getName() : null)
                .otherVerificationSignOffRole(rc.getOtherVerificationSignOffRole())
                .targetDate(rc.getTargetDate())
                .utilisationPercentage(rc.getUtilisationPercentage())
                .triggerBasis(rc.getTriggerBasis() != null ? rc.getTriggerBasis().name() : null)
                .triggerBasisLabel(rc.getTriggerBasis() != null ? rc.getTriggerBasis().getLabel() : null)
                .description(rc.getDescription())
                .remindSomeone(rc.getRemindSomeone())
                .responsibleRoleId(rc.getResponsibleRole() != null ? rc.getResponsibleRole().getId() : null)
                .responsibleRoleLabel(rc.getResponsibleRole() != null ? rc.getResponsibleRole().getName() : null)
                .otherResponsibleRole(rc.getOtherResponsibleRole())
                .reminderLeadTime(rc.getReminderLeadTime())
                .repeatReminder(rc.getRepeatReminder() != null ? rc.getRepeatReminder().name() : null)
                .repeatReminderLabel(rc.getRepeatReminder() != null ? rc.getRepeatReminder().getLabel() : null)
                .escalateToDeputy(rc.getEscalateToDeputy())
                .build();
    }
}
