package com.ngo.finance.funding.service.impl;

import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.donor.dto.request.CreateGrantRequest;
import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.dto.response.GrantDetailsResponse;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.GrantAgreement;
import com.ngo.finance.donor.enums.GrantStatus;
import com.ngo.finance.donor.repository.DonorFundProfileRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.repository.GrantRepository;
import com.ngo.finance.donor.service.FundProfileService;
import com.ngo.finance.donor.service.GrantService;
import com.ngo.finance.funding.dto.FundingListItem;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.funding.dto.FundingRequest.AgreementPart;
import com.ngo.finance.funding.dto.FundingResponse;
import com.ngo.finance.funding.dto.FundingStage;
import com.ngo.finance.funding.service.AgreementNamer;
import com.ngo.finance.funding.service.FundingQuery;
import com.ngo.finance.funding.service.FundingService;
import com.ngo.finance.funding.validator.FundingValidator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.ngo.finance.funding.service.FundingChangeLogService;
import com.ngo.finance.funding.service.FundingSnapshot;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Saves a funding record by reusing the existing fund profile and grant
 * services inside one transaction: if the agreement can't be saved, the terms
 * saved a moment earlier are rolled back too, so no half-made record is left.
 */
@Slf4j
@Service
@Transactional
public class FundingServiceImpl implements FundingService {

    @Autowired
    private FundProfileService fundProfileService;

    @Autowired
    private GrantService grantService;

    @Autowired
    private DonorRepository donorRepository;

    @Autowired
    private DonorFundProfileRepository profileRepository;

    @Autowired
    private GrantRepository grantRepository;

    @Autowired
    private FundingValidator validator;

    @Autowired
    private AgreementNamer agreementNamer;

    @Autowired
    private FundingQuery query;

    @Autowired
    private FundingChangeLogService changeLog;

    @Override
    public FundingResponse create(FundingRequest request) {
        DonorMaster donor = donorRepository.findById(request.getDonorId())
                .orElseThrow(() -> new ResourceNotFoundException("Donor", request.getDonorId()));
        validator.validate(request, donor, null, true);

        FundProfileResponse terms = fundProfileService.createProfile(donor.getId(), request.getTerms());
        GrantDetailsResponse agreement = null;
        if (request.getAgreement() != null) {
            agreement = grantService.createGrant(toGrantRequest(request.getAgreement(), terms, donor, null));
        }
        changeLog.recordCreated(terms, agreement, request.getActor(), request.getChangeNote());
        log.info("Funding created: profile {} / agreement {}", terms.getProfileCode(),
                agreement != null ? agreement.getGrantCode() : "—");
        return FundingResponse.of(terms, agreement);
    }

    @Override
    public FundingResponse update(Long profileId, FundingRequest request) {
        DonorFundProfile profile = profileRepository.findById(profileId)
                .orElseThrow(() -> new ResourceNotFoundException("Fund profile", profileId));
        DonorMaster donor = profile.getDonor();
        if (donor == null || !donor.getId().equals(request.getDonorId())) {
            throw new ValidationException("Validation failed for one or more fields",
                    new HashMap<>(Map.of("donorId", "The donor of a funding record can't be changed")));
        }
        GrantAgreement existing = grantRepository.findByFundProfileId(profileId).stream().findFirst().orElse(null);
        validator.validate(request, donor, existing, false);
        validator.validateTrancheRemovals(profile, request.getTerms());
        // The record as it was, for the change log (read before anything is written).
        FundingResponse was = query.get(profileId);
        FundingSnapshot before = FundingSnapshot.of(was.getTerms(), was.getAgreement());

        FundProfileResponse terms = fundProfileService.updateProfile(profileId, request.getTerms());
        GrantDetailsResponse agreement;
        if (request.getAgreement() == null) {
            // Terms-only edit: an agreement already signed is left as it is —
            // except its total, a copy of the terms' committed amount, which
            // must follow the terms.
            if (existing != null) {
                existing.setTotalGrantAmount(committedOf(terms));
                grantRepository.save(existing);
            }
            agreement = existing != null ? grantService.getGrantById(existing.getId()) : null;
        } else if (existing != null) {
            agreement = grantService.updateGrant(existing.getId(),
                    toGrantRequest(request.getAgreement(), terms, donor, existing));
        } else {
            agreement = grantService.createGrant(toGrantRequest(request.getAgreement(), terms, donor, null));
        }
        int logged = changeLog.recordUpdate(profileId, before, FundingSnapshot.of(terms, agreement), agreement,
                request.getActor(), request.getChangeNote());
        log.info("Funding updated: profile {} ({} changes logged)", terms.getProfileCode(), logged);
        return FundingResponse.of(terms, agreement);
    }

    @Override
    @Transactional(readOnly = true)
    public FundingResponse get(Long profileId) {
        return query.get(profileId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FundingListItem> list(Long donorId, FundingStage stage) {
        return query.list(donorId, stage);
    }

    /** The terms' committed amount — what an agreement's total_grant_amount copies (first disbursement rule). */
    private static java.math.BigDecimal committedOf(FundProfileResponse terms) {
        return terms.getDisbursementRules() == null ? null : terms.getDisbursementRules().stream()
                .findFirst()
                .map(FundProfileResponse.DisbursementRuleItem::getTotalAmount)
                .orElse(null);
    }

    /**
     * The grant request built from the form's agreement fields. Name, status and
     * approval are the server's: on update the current status and approval are
     * kept (approvalStatus left null = unchanged), and the document stays if no
     * new one is given.
     */
    private CreateGrantRequest toGrantRequest(AgreementPart part, FundProfileResponse terms, DonorMaster donor,
            GrantAgreement existing) {
        String document = part.getAgreementDocumentPath();
        if ((document == null || document.isBlank()) && existing != null) {
            document = existing.getAgreementDocumentPath();
        }
        return CreateGrantRequest.builder()
                .fundProfileId(terms.getId())
                .agreementName(agreementNamer.nameFor(existing, donor, terms, part.getStartDate()))
                .agreementDate(part.getAgreementDate())
                .startDate(part.getStartDate())
                .endDate(part.getEndDate())
                .description(part.getDescription())
                .agreementDocumentPath(document)
                .status(existing != null && existing.getGrantStatus() != null
                        ? existing.getGrantStatus() : GrantStatus.ACTIVE)
                .build();
    }
}
