package com.ngo.finance.funding.api;

import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.donor.dto.request.ApproveGrantRequest;
import com.ngo.finance.donor.dto.request.CreateGrantRequest;
import com.ngo.finance.donor.dto.request.GrantRemarksRequest;
import com.ngo.finance.donor.entity.DonorDisbursementRule;
import com.ngo.finance.donor.entity.DonorFundProfile;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.DonorReleaseCriteria;
import com.ngo.finance.donor.entity.DonorTrancheCriterion;
import com.ngo.finance.donor.enums.CriterionType;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.donor.enums.FundClass;
import com.ngo.finance.donor.enums.GrantStatus;
import com.ngo.finance.donor.repository.DonorFundProfileRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.service.GrantService;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import com.ngo.finance.programme.entity.Programme;
import com.ngo.finance.programme.repository.ProgrammeRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The agreement's status steps on /api/v1/funding/{id}/approve|activate|hold|
 * resume|complete|close — {id} is the funding record (fund profile) id; the
 * old /api/v1/grants and /api/v1/fund-profiles endpoints are gone.
 *
 * A grant inherits its donor,
 * programme, class and total from a fund profile ({@code fundProfileId}) — the
 * total being Σ of that profile's tranche plan — with a currency and a locked FX
 * rate.
 *
 * Two independent state fields, matching the two Status dropdowns on the New
 * Grant Agreement Form: {@code status} (ACTIVE / COMPLETED / CANCELLED, section
 * 1) with {@code isActive} as its boolean mirror, and the approval workflow
 * {@code isApproved} (1 = approved, 2 = pending, 3 = on hold, 4 = completed,
 * section 3). A grant can be ACTIVE while approval is still pending.
 *
 * Runs against the seeded DB, so assertions filter by the unique grant code
 * rather than assuming an empty table.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class FundingLifecycleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DonorRepository donorRepository;

    @Autowired
    private ProgrammeRepository programmeRepository;

    @Autowired
    private DonorFundProfileRepository fundProfileRepository;

    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;

    @Autowired
    private GrantService grantService;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    /** Seeds a donor + programme + fund profile that grants can be created from. */
    private DonorFundProfile seedFundProfile(String suffix) {
        DonorMaster donor = donorRepository.save(DonorMaster.builder()
                .donorCode("DN-TEST-" + suffix)
                .donorName("Test Donor " + suffix)
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("donor" + suffix + "@example.com")
                .isActive(true)
                .build());

        Programme programme = programmeRepository.save(Programme.builder()
                .programmeCode("PGM-TEST-" + suffix)
                .programmeName("Test Programme " + suffix)
                .build());

        DonorFundProfile profile = DonorFundProfile.builder()
                .profileCode("FP-TEST-" + suffix)
                .donor(donor)
                .programme(programme)
                .fundMode(FundMode.RESTRICTED)
                .fundClass(FundClass.CLASS_A_RESTRICTED)
                .programmeTied(true) // Restricted is always programme-tied (chk_profile_mode_class)
                .purpose("Test profile")
                .build();

        // A grant's total is its active disbursement rule's committed amount, so
        // every profile a grant is created from needs one. 250,000 here.
        DonorDisbursementRule rule = DonorDisbursementRule.builder()
                .fundProfile(profile)
                .totalAmount(new BigDecimal("250000.00"))
                .disbursementType(DisbursementType.TRANCHES)
                .build();

        DonorTrancheCriterion first = new DonorTrancheCriterion();
        first.setDonorDisbursementRule(rule);
        first.setAmountCriteria(new BigDecimal("150000.00"));
        DonorReleaseCriteria firstCriterion = new DonorReleaseCriteria();
        firstCriterion.setDonorTrancheCriterion(first);
        firstCriterion.setReleaseCriteria(CriterionType.ON_SIGNING);
        first.getDonorReleaseCriteria().add(firstCriterion);
        rule.getDonorTrancheCriteria().add(first);

        DonorTrancheCriterion second = new DonorTrancheCriterion();
        second.setDonorDisbursementRule(rule);
        second.setAmountCriteria(new BigDecimal("100000.00"));
        DonorReleaseCriteria secondCriterion = new DonorReleaseCriteria();
        secondCriterion.setDonorTrancheCriterion(second);
        secondCriterion.setReleaseCriteria(CriterionType.UTILISATION_CERTIFICATE);
        second.getDonorReleaseCriteria().add(secondCriterion);
        rule.getDonorTrancheCriteria().add(second);

        profile.getDisbursementRules().add(rule);
        profile.assignTrancheCodes(); // FP-TEST-{suffix}-T1, -T2 (tranche_code is NOT NULL)

        return fundProfileRepository.save(profile);
    }

    private CreateGrantRequest.CreateGrantRequestBuilder grantRequestBuilder(String code, Long fundProfileId) {
        return CreateGrantRequest.builder()
                .grantCode(code)
                .fundProfileId(fundProfileId)
                .agreementName("Test Grant Agreement " + code)
                .agreementDate(LocalDate.of(2026, 1, 1))
                .startDate(LocalDate.of(2026, 1, 2))
                .endDate(LocalDate.of(2026, 12, 31))
                // No totalGrantAmount: it is inherited from the fund profile.
                .status(GrantStatus.ACTIVE);
    }

    /**
     * Agreements are created through Funding Agreements (POST /api/v1/funding),
     * which calls GrantService — the /api/v1/grants write endpoints are gone.
     * These tests only need an agreement to read and move through its
     * lifecycle, so they create it with the service directly.
     */
    private long createGrant(String code, Long fundProfileId) {
        return grantService.createGrant(grantRequestBuilder(code, fundProfileId).build()).getId();
    }

    @Test
    @WithMockUser
    void testOldGrantAndFundProfileEndpointsAreGone() throws Exception {
        DonorFundProfile profile = seedFundProfile("C0");
        long id = createGrant("GR-TEST-C0", profile.getId());

        mockMvc.perform(get("/api/v1/grants/{id}", id)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/grants")).andExpect(status().isNotFound());
        mockMvc.perform(patch("/api/v1/grants/{id}/approve", id).with(csrf())).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/fund-profiles/{id}", profile.getId())).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/donors/{id}/fund-profiles", profile.getDonor().getId())).andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser
    void testRecordCarriesTheAgreement() throws Exception {
        DonorFundProfile profile = seedFundProfile("C2");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C2", pid);

        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.agreement.id").value(id))
                .andExpect(jsonPath("$.agreement.grantCode").value("GR-TEST-C2"));
    }

    @Test
    @WithMockUser
    void testStatusStepsNeedAKnownRecordWithAnAgreement() throws Exception {
        mockMvc.perform(patch("/api/v1/funding/{id}/approve", 999_999L).with(csrf()))
                .andExpect(status().isNotFound());

        // Terms only (no agreement yet): nothing to approve.
        DonorFundProfile termsOnly = seedFundProfile("C3");
        mockMvc.perform(patch("/api/v1/funding/{id}/approve", termsOnly.getId()).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(containsString("no grant agreement yet")));
    }

    @Test
    @WithMockUser
    void testListCarriesTheAgreementStatus() throws Exception {
        DonorFundProfile profile = seedFundProfile("C4");
        createGrant("GR-TEST-C4", profile.getId());

        mockMvc.perform(get("/api/v1/funding").param("donorId", profile.getDonor().getId().toString()))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("GR-TEST-C4")))
                .andExpect(jsonPath("$[0].grantCode").value("GR-TEST-C4"))
                .andExpect(jsonPath("$[0].agreementStatus").value("ACTIVE"))
                .andExpect(jsonPath("$[0].active").value(true));
    }

    @Test
    @WithMockUser
    void testApprovalWorkflow_ApproveHoldResumeComplete() throws Exception {
        DonorFundProfile profile = seedFundProfile("C5");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C5", profile.getId());

        // Pending by default.
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(2));

        // approve: pending -> approved, captures approver/remarks/date.
        ApproveGrantRequest approveRequest = ApproveGrantRequest.builder()
                .approvedBy(42L)
                .remarks("Looks good")
                .build();
        mockMvc.perform(patch("/api/v1/funding/{id}/approve", pid)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(approveRequest)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(1))
                .andExpect(jsonPath("$.agreement.approvedBy").value(42))
                .andExpect(jsonPath("$.agreement.approvalRemarks").value("Looks good"))
                .andExpect(jsonPath("$.agreement.approvalDate").exists());

        // hold: approved -> on hold, remarks updated.
        GrantRemarksRequest holdRequest = GrantRemarksRequest.builder()
                .remarks("Paused pending donor clarification")
                .build();
        mockMvc.perform(patch("/api/v1/funding/{id}/hold", pid)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(holdRequest)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(3))
                .andExpect(jsonPath("$.agreement.approvalRemarks").value("Paused pending donor clarification"));

        // resume: on hold -> approved.
        mockMvc.perform(patch("/api/v1/funding/{id}/resume", pid).with(csrf()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(1));

        // complete: approved -> completed (terminal).
        mockMvc.perform(patch("/api/v1/funding/{id}/complete", pid).with(csrf()))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(4))
                // Completing the workflow also settles the agreement status.
                .andExpect(jsonPath("$.agreement.status").value("COMPLETED"));
    }

    @Test
    @WithMockUser
    void testCloseAndActivate_ToggleStatusAndIsActive() throws Exception {
        DonorFundProfile profile = seedFundProfile("C6");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C6", profile.getId());

        // New grants are active by default.
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.status").value("ACTIVE"))
                .andExpect(jsonPath("$.agreement.isActive").value(true));

        // close: always succeeds, regardless of approval state.
        mockMvc.perform(patch("/api/v1/funding/{id}/close", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.status").value("CANCELLED"))
                .andExpect(jsonPath("$.agreement.isActive").value(false));

        // activate: blocked while still pending (never approved) — guarded no-op.
        mockMvc.perform(patch("/api/v1/funding/{id}/activate", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.status").value("CANCELLED"))
                .andExpect(jsonPath("$.agreement.isActive").value(false));

        // Once approved, activate succeeds.
        mockMvc.perform(patch("/api/v1/funding/{id}/approve", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(patch("/api/v1/funding/{id}/activate", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.status").value("ACTIVE"))
                .andExpect(jsonPath("$.agreement.isActive").value(true));
    }

    @Test
    @WithMockUser
    void testApproveGrant_NoOpWhenAlreadyApproved() throws Exception {
        DonorFundProfile profile = seedFundProfile("C7");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C7", profile.getId());

        mockMvc.perform(patch("/api/v1/funding/{id}/approve", pid).with(csrf()))
                .andExpect(status().isNoContent());
        // Approving again is a guarded no-op (isApproved stays 1, no error).
        mockMvc.perform(patch("/api/v1/funding/{id}/approve", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(1));
    }

    @Test
    @WithMockUser
    void testHoldGrant_NoOpWhenPending() throws Exception {
        DonorFundProfile profile = seedFundProfile("C8");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C8", profile.getId());

        // Never approved — hold is a guarded no-op.
        mockMvc.perform(patch("/api/v1/funding/{id}/hold", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(2));
    }

    @Test
    @WithMockUser
    void testResumeGrant_NoOpWhenNotOnHold() throws Exception {
        DonorFundProfile profile = seedFundProfile("C9");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C9", profile.getId());
        mockMvc.perform(patch("/api/v1/funding/{id}/approve", pid).with(csrf()))
                .andExpect(status().isNoContent());

        // Approved, not on hold — resume is a guarded no-op.
        mockMvc.perform(patch("/api/v1/funding/{id}/resume", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(1));
    }

    @Test
    @WithMockUser
    void testCompleteGrant_NoOpWhenPending() throws Exception {
        DonorFundProfile profile = seedFundProfile("C10");
        long pid = profile.getId();
        long id = createGrant("GR-TEST-C10", profile.getId());

        // Never approved — complete is a guarded no-op.
        mockMvc.perform(patch("/api/v1/funding/{id}/complete", pid).with(csrf()))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/funding/{id}", pid))
                .andExpect(jsonPath("$.agreement.isApproved").value(2));
    }
}
