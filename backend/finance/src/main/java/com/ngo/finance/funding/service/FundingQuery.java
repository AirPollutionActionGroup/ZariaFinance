package com.ngo.finance.funding.service;

import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.dto.response.GrantDetailsResponse;
import com.ngo.finance.donor.dto.response.GrantListResponse;
import com.ngo.finance.donor.entity.GrantAgreement;
import com.ngo.finance.donor.repository.GrantRepository;
import com.ngo.finance.donor.service.FundProfileService;
import com.ngo.finance.donor.service.GrantService;
import com.ngo.finance.funding.dto.FundingListItem;
import com.ngo.finance.funding.dto.FundingResponse;
import com.ngo.finance.funding.dto.FundingStage;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of funding: joins each fund profile with the agreement signed
 * on it (a profile backs at most one — uq_grant_fund_profile) and works out the
 * stage. Done here once, so the browser no longer joins two lists itself.
 */
@Component
@Transactional(readOnly = true)
public class FundingQuery {

    @Autowired
    private FundProfileService fundProfileService;

    @Autowired
    private GrantService grantService;

    @Autowired
    private GrantRepository grantRepository;

    public FundingResponse get(Long profileId) {
        FundProfileResponse terms = fundProfileService.getProfileById(profileId);
        GrantDetailsResponse agreement = grantRepository.findByFundProfileId(profileId).stream()
                .findFirst()
                .map(GrantAgreement::getId)
                .map(grantService::getGrantById)
                .orElse(null);
        return FundingResponse.of(terms, agreement);
    }

    public List<FundingListItem> list(Long donorId, FundingStage stage) {
        List<FundProfileResponse> profiles = donorId != null
                ? fundProfileService.getProfilesByDonor(donorId)
                : fundProfileService.getAllProfiles();
        List<GrantListResponse> grants = donorId != null
                ? grantService.getGrantsByDonorId(donorId)
                : grantService.getAllGrants();

        Map<Long, GrantListResponse> grantByProfile = new HashMap<>();
        for (GrantListResponse grant : grants) {
            if (grant.getFundProfileId() != null) {
                grantByProfile.putIfAbsent(grant.getFundProfileId(), grant);
            }
        }

        List<FundingListItem> items = new ArrayList<>();
        Set<Long> profileIds = new HashSet<>();
        for (FundProfileResponse profile : profiles) {
            profileIds.add(profile.getId());
            items.add(toItem(profile, grantByProfile.get(profile.getId())));
        }
        // Older agreements whose profile isn't listed still show, so nothing is hidden.
        for (GrantListResponse grant : grants) {
            if (grant.getFundProfileId() == null || !profileIds.contains(grant.getFundProfileId())) {
                items.add(toItem(null, grant));
            }
        }
        return stage == null ? items : items.stream().filter(item -> item.getStage() == stage).toList();
    }

    private FundingListItem toItem(FundProfileResponse profile, GrantListResponse grant) {
        FundingStage stage = FundingStage.of(grant != null, grant != null ? grant.getIsApproved() : null);
        List<FundProfileResponse.DisbursementRuleItem> rules = profile != null && profile.getDisbursementRules() != null
                ? profile.getDisbursementRules() : List.of();
        FundProfileResponse.DisbursementRuleItem fc = rules.stream()
                .filter(rule -> Boolean.TRUE.equals(rule.getForeign()))
                .findFirst()
                .orElse(null);
        BigDecimal committed = grant != null && grant.getTotalGrantAmount() != null
                ? grant.getTotalGrantAmount()
                : rules.stream().map(FundProfileResponse.DisbursementRuleItem::getTotalAmount)
                        .filter(Objects::nonNull).reduce(BigDecimal.ZERO, BigDecimal::add);

        return FundingListItem.builder()
                .profileId(profile != null ? profile.getId() : null)
                .grantId(grant != null ? grant.getId() : null)
                .profileCode(profile != null ? profile.getProfileCode() : null)
                .grantCode(grant != null ? grant.getGrantCode() : null)
                .legacyCode(grant != null ? grant.getLegacyCode() : null)
                .donorId(profile != null ? profile.getDonorId() : null)
                .donorName(profile != null ? profile.getDonorName() : grant.getDonorName())
                .title(grant != null && grant.getAgreementName() != null
                        ? grant.getAgreementName() : profile != null ? profile.getPurpose() : null)
                .programmeName(profile != null ? profile.getProgrammeName() : null)
                .fundClass(profile != null ? profile.getFundClass() : grant.getFundClassCode())
                .fundClassLabel(profile != null ? profile.getFundClassLabel() : null)
                .committed(committed)
                .currency(fc != null ? fc.getCurrency() : null)
                .foreignAmount(fc != null ? fc.getForeignAmount() : null)
                .hasSchedule(grant != null || !rules.isEmpty())
                .startDate(grant != null ? grant.getStartDate() : null)
                .endDate(grant != null ? grant.getEndDate() : null)
                .stage(stage)
                .stageLabel(stage.getLabel())
                .agreementStatus(grant != null && grant.getStatus() != null ? grant.getStatus().toString() : null)
                .active(grant != null ? grant.getIsActive() : null)
                .build();
    }
}
