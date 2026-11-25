package com.ngo.finance.funding.api;

import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.DisbursementRuleItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.ReleaseCriterionItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.TrancheCriterionItem;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.GrantAgreement;
import com.ngo.finance.donor.enums.CriterionType;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.donor.enums.FundClass;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.donor.repository.DonorFundProfileRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.repository.GrantRepository;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.funding.dto.FundingRequest.AgreementPart;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/**
 * /api/v1/funding — the fund profile (terms) and grant agreement saved and read
 * as one record.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class FundingControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DonorRepository donorRepository;

    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;

    @Autowired
    private DonorFundProfileRepository profileRepository;

    @Autowired
    private GrantRepository grantRepository;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private DonorMaster seedDonor(String suffix, FundSourceDomicile domicile) {
        return donorRepository.save(DonorMaster.builder()
                .donorCode("DN-FUND-" + suffix)
                .donorName("Funding Donor " + suffix)
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("funding" + suffix + "@example.com")
                .fundSourceDomicile(domicile)
                .isActive(true)
                .build());
    }

    private static TrancheCriterionItem tranche(String amount, LocalDate date, boolean last) {
        return TrancheCriterionItem.builder()
                .amountCriteria(new BigDecimal(amount))
                .expectedReleaseDate(date)
                .isFinalTranche(last)
                .criteria(List.of(ReleaseCriterionItem.builder().releaseCriteria(CriterionType.ON_SIGNING).build()))
                .build();
    }

    /** Unrestricted, Class C, ₹200,000 in two tranches. */
    private static CreateFundProfileRequest terms() {
        return CreateFundProfileRequest.builder()
                .fundMode(FundMode.UNRESTRICTED)
                .fundClass(FundClass.CLASS_C_UNRESTRICTED)
                .programmeTied(false)
                .purpose("Clean air outreach")
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("200000.00"))
                        .disbursementType(DisbursementType.TRANCHES)
                        .trancheCriteria(List.of(
                                tranche("120000.00", LocalDate.of(2026, 12, 1), false),
                                tranche("80000.00", LocalDate.of(2027, 3, 1), true)))
                        .build()))
                .build();
    }

    private static AgreementPart agreement() {
        return AgreementPart.builder()
                .agreementDate(LocalDate.of(2026, 11, 10))
                .startDate(LocalDate.of(2026, 12, 1))
                .endDate(LocalDate.of(2027, 11, 30))
                .agreementDocumentPath("signed-agreement.pdf")
                .build();
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder,
            FundingRequest request) throws Exception {
        return mockMvc.perform(builder.with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)));
    }

    private JsonNode body(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }

    @Test
    @WithMockUser
    void testCreatesTermsAndAgreementTogether() throws Exception {
        DonorMaster donor = seedDonor("C1", FundSourceDomicile.DOMESTIC);

        send(post("/api/v1/funding"), FundingRequest.builder()
                        .donorId(donor.getId()).terms(terms()).agreement(agreement()).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stage").value("PENDING"))
                .andExpect(jsonPath("$.terms.profileCode").value(matchesPattern("FP-\\d{4}-\\d{3,}")))
                .andExpect(jsonPath("$.agreement.grantCode").value(matchesPattern("GA-2026-27-\\d{3}")))
                .andExpect(jsonPath("$.agreement.legacyCode").doesNotExist())
                .andExpect(jsonPath("$.agreement.fundProfileId").isNumber())
                .andExpect(jsonPath("$.agreement.totalGrantAmount").value(200000.00))
                .andExpect(jsonPath("$.agreement.agreementName")
                        .value("Funding Donor C1 · Clean air outreach · FY 2026-27"));
    }

    /** Agreement numbers: GA-{financial year of the signed date}-{nnn}, one running sequence per year. */
    @Test
    @WithMockUser
    void testAgreementNumbersFollowTheFinancialYear() throws Exception {
        DonorMaster donor = seedDonor("C20", FundSourceDomicile.DOMESTIC);
        String first = agreementCode(donor, LocalDate.of(2026, 11, 10));
        String second = agreementCode(donor, LocalDate.of(2027, 2, 15)); // Feb 2027 is still FY 2026-27
        String nextYear = agreementCode(donor, LocalDate.of(2027, 4, 1)); // April starts FY 2027-28

        org.assertj.core.api.Assertions.assertThat(first).matches("GA-2026-27-\\d{3}");
        org.assertj.core.api.Assertions.assertThat(second).matches("GA-2026-27-\\d{3}");
        org.assertj.core.api.Assertions.assertThat(Integer.parseInt(second.substring(11)))
                .isEqualTo(Integer.parseInt(first.substring(11)) + 1);
        org.assertj.core.api.Assertions.assertThat(nextYear).matches("GA-2027-28-\\d{3}");
    }

    private String agreementCode(DonorMaster donor, LocalDate signedOn) throws Exception {
        AgreementPart part = agreement();
        part.setAgreementDate(signedOn);
        part.setStartDate(signedOn);
        part.setEndDate(signedOn.plusYears(1));
        return body(send(post("/api/v1/funding"), FundingRequest.builder()
                        .donorId(donor.getId()).terms(terms()).agreement(part).build())
                .andExpect(status().isCreated()))
                .get("agreement").get("grantCode").asText();
    }

    @Test
    @WithMockUser
    void testCreatesTermsOnly() throws Exception {
        DonorMaster donor = seedDonor("C2", FundSourceDomicile.DOMESTIC);

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(terms()).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.stage").value("TERMS"))
                .andExpect(jsonPath("$.agreement").doesNotExist());
    }

    @Test
    @WithMockUser
    void testOnOffFlagsAreOptional() throws Exception {
        DonorMaster donor = seedDonor("C14", FundSourceDomicile.DOMESTIC);
        CreateFundProfileRequest noFlags = terms();
        noFlags.setProgrammeTied(null);
        noFlags.setMovementAllowed(null);
        noFlags.setExplanationRequired(null);
        noFlags.setOnboardingComplete(null);

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(noFlags).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.terms.programmeTied").value(false))
                .andExpect(jsonPath("$.terms.movementAllowed").value(false))
                .andExpect(jsonPath("$.terms.explanationRequired").value(false))
                .andExpect(jsonPath("$.terms.onboardingComplete").value(false));
    }

    @Test
    @WithMockUser
    void testTrancheFrequencyIsOptional() throws Exception {
        DonorMaster donor = seedDonor("C12", FundSourceDomicile.DOMESTIC);
        CreateFundProfileRequest noFrequency = terms();
        noFrequency.getDisbursementRules().get(0).getTrancheCriteria().forEach(t -> t.setFrequency(null));

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(noFrequency).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.terms.disbursementRules[0].trancheCriteria[0].frequency").value("MONTHLY"));
    }

    @Test
    @WithMockUser
    void testNothingIsSavedWhenTheAgreementIsInvalid() throws Exception {
        DonorMaster donor = seedDonor("C3", FundSourceDomicile.DOMESTIC);
        AgreementPart noDocument = agreement();
        noDocument.setAgreementDocumentPath(null);
        noDocument.setEndDate(LocalDate.of(2026, 1, 1));

        send(post("/api/v1/funding"), FundingRequest.builder()
                        .donorId(donor.getId()).terms(terms()).agreement(noDocument).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['agreement.agreementDocumentPath']").exists())
                .andExpect(jsonPath("$.errors['agreement.endDate']").exists());

        org.assertj.core.api.Assertions.assertThat(profileRepository.findByDonorId(donor.getId())).isEmpty();
    }

    @Test
    @WithMockUser
    void testTermsErrorsArePrefixed() throws Exception {
        DonorMaster donor = seedDonor("C4", FundSourceDomicile.DOMESTIC);
        CreateFundProfileRequest noSchedule = terms();
        noSchedule.setDisbursementRules(List.of());

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(noSchedule).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules']").exists());
    }

    @Test
    @WithMockUser
    void testFundModeDecidesTiedAndClass() throws Exception {
        DonorMaster donor = seedDonor("C5", FundSourceDomicile.DOMESTIC);
        CreateFundProfileRequest restrictedButClassC = terms();
        restrictedButClassC.setFundMode(FundMode.RESTRICTED);

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(restrictedButClassC).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.fundClass']").exists())
                .andExpect(jsonPath("$.errors['terms.programmeTied']").exists());
    }

    @Test
    @WithMockUser
    void testTranchesCannotExceedTheCommitment() throws Exception {
        DonorMaster donor = seedDonor("C6", FundSourceDomicile.DOMESTIC);
        CreateFundProfileRequest over = terms();
        over.getDisbursementRules().get(0).setTotalAmount(new BigDecimal("150000.00"));

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(over).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.trancheCriteria']").exists());
    }

    @Test
    @WithMockUser
    void testNewFcDonorFundingNeedsTheForeignCurrency() throws Exception {
        DonorMaster donor = seedDonor("C7", FundSourceDomicile.FOREIGN);

        send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(terms()).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.currency']").exists());
    }

    @Test
    @WithMockUser
    void testUpdateAddsAnAgreementThenKeepsItsNameAndApproval() throws Exception {
        DonorMaster donor = seedDonor("C8", FundSourceDomicile.DOMESTIC);
        long id = body(send(post("/api/v1/funding"),
                FundingRequest.builder().donorId(donor.getId()).terms(terms()).build())).get("id").asLong();

        // 1 · add the agreement to a terms-only record
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder()
                        .donorId(donor.getId()).terms(terms()).agreement(agreement()).build())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("PENDING"));

        // 2 · approve it, then edit the terms and agreement again
        GrantAgreement grant = grantRepository.findByFundProfileId(id).get(0);
        grant.setIsApproved(1);
        grantRepository.save(grant);

        CreateFundProfileRequest renamed = terms();
        renamed.setPurpose("A different purpose");
        AgreementPart noNewDocument = agreement();
        noNewDocument.setAgreementDocumentPath(null);

        send(put("/api/v1/funding/{id}", id), FundingRequest.builder()
                        .donorId(donor.getId()).terms(renamed).agreement(noNewDocument).build())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("APPROVED"))
                .andExpect(jsonPath("$.agreement.agreementName")
                        .value("Funding Donor C8 · Clean air outreach · FY 2026-27"))
                .andExpect(jsonPath("$.agreement.agreementDocumentPath").value("signed-agreement.pdf"))
                .andExpect(jsonPath("$.terms.purpose").value("A different purpose"));
    }

    @Test
    @WithMockUser
    void testTermsOnlyEditKeepsTheAgreementTotalInStep() throws Exception {
        DonorMaster donor = seedDonor("C13", FundSourceDomicile.DOMESTIC);
        long id = body(send(post("/api/v1/funding"), FundingRequest.builder()
                .donorId(donor.getId()).terms(terms()).agreement(agreement()).build())).get("id").asLong();

        CreateFundProfileRequest bigger = terms();
        bigger.getDisbursementRules().get(0).setTotalAmount(new BigDecimal("250000.00"));

        // No agreement part sent: the agreement is left as it is, but its total follows the terms.
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId()).terms(bigger).build())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terms.disbursementRules[0].totalAmount").value(250000.00))
                .andExpect(jsonPath("$.agreement.totalGrantAmount").value(250000.00));
    }

    @Test
    @WithMockUser
    void testDonorCannotBeChangedOnUpdate() throws Exception {
        DonorMaster donor = seedDonor("C9", FundSourceDomicile.DOMESTIC);
        DonorMaster other = seedDonor("C10", FundSourceDomicile.DOMESTIC);
        long id = body(send(post("/api/v1/funding"),
                FundingRequest.builder().donorId(donor.getId()).terms(terms()).build())).get("id").asLong();

        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(other.getId()).terms(terms()).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['donorId']").exists());
    }

    @Test
    @WithMockUser
    void testGetAndList() throws Exception {
        DonorMaster donor = seedDonor("C11", FundSourceDomicile.DOMESTIC);
        long id = body(send(post("/api/v1/funding"), FundingRequest.builder()
                .donorId(donor.getId()).terms(terms()).agreement(agreement()).build())).get("id").asLong();

        mockMvc.perform(get("/api/v1/funding/{id}", id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.stage").value("PENDING"))
                .andExpect(jsonPath("$.agreement.grantCode").exists());

        mockMvc.perform(get("/api/v1/funding").param("donorId", donor.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].profileId").value(id))
                .andExpect(jsonPath("$[0].committed").value(200000.00))
                .andExpect(jsonPath("$[0].stage").value("PENDING"));

        mockMvc.perform(get("/api/v1/funding").param("stage", "PENDING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].profileId", hasItem((int) id)));

        mockMvc.perform(get("/api/v1/funding").param("donorId", donor.getId().toString()).param("stage", "TERMS"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // ── Change history ─────────────────────────────────────────────────────

    private JsonNode history(long id) throws Exception {
        return body(mockMvc.perform(get("/api/v1/funding/{id}/history", id)).andExpect(status().isOk()));
    }

    @Test
    @WithMockUser
    void testChangeHistoryRecordsCreateEditsAndStatusSteps() throws Exception {
        DonorMaster donor = seedDonor("H1", FundSourceDomicile.DOMESTIC);
        FundingRequest create = FundingRequest.builder().donorId(donor.getId()).terms(terms()).actor("Asha").build();
        long id = body(send(post("/api/v1/funding"), create).andExpect(status().isCreated())).get("id").asLong();

        JsonNode h = history(id);
        org.assertj.core.api.Assertions.assertThat(h.size()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("action").asText()).isEqualTo("CREATED");
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("changedBy").asText()).isEqualTo("Asha");

        // An edit: one entry, the changed field with its old and new value, the reason and who made it.
        CreateFundProfileRequest edited = keepSavedIds(terms(), id);
        edited.setPurpose("Clean air outreach — phase 2");
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId()).terms(edited)
                .actor("Ravi").changeNote("Donor asked to extend the scope").build())
                .andExpect(status().isOk());
        h = history(id);
        org.assertj.core.api.Assertions.assertThat(h.size()).isEqualTo(2);
        JsonNode edit = h.get(0);
        org.assertj.core.api.Assertions.assertThat(edit.get("action").asText()).isEqualTo("UPDATED");
        org.assertj.core.api.Assertions.assertThat(edit.get("changedBy").asText()).isEqualTo("Ravi");
        org.assertj.core.api.Assertions.assertThat(edit.get("note").asText()).isEqualTo("Donor asked to extend the scope");
        org.assertj.core.api.Assertions.assertThat(edit.get("changes").size()).as(edit.get("changes").toString()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(edit.get("changes").get(0).get("field").asText()).isEqualTo("Purpose");
        org.assertj.core.api.Assertions.assertThat(edit.get("changes").get(0).get("from").asText()).isEqualTo("Clean air outreach");
        org.assertj.core.api.Assertions.assertThat(edit.get("changes").get(0).get("to").asText()).isEqualTo("Clean air outreach — phase 2");

        // Saving again with nothing changed writes nothing.
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId()).terms(edited).actor("Ravi").build())
                .andExpect(status().isOk());
        org.assertj.core.api.Assertions.assertThat(history(id).size()).isEqualTo(2);

        // Recording the agreement later is one "Agreement recorded" entry.
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId()).terms(edited)
                .agreement(agreement()).actor("Ravi").build())
                .andExpect(status().isOk());
        h = history(id);
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("action").asText()).isEqualTo("AGREEMENT_ADDED");
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("changes").get(0).get("to").asText()).matches("GA-\\d{4}-\\d{2}-\\d{3} · signed 10 Nov 2026.*");

        // Approving the agreement is a status step with its remarks.
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .patch("/api/v1/funding/{id}/approve", id).param("actor", "Meera").with(csrf())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"remarks\":\"Checked against the signed copy\"}"))
                .andExpect(status().isNoContent());
        h = history(id);
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("action").asText()).isEqualTo("APPROVED");
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("changedBy").asText()).isEqualTo("Meera");
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("note").asText()).isEqualTo("Checked against the signed copy");
        org.assertj.core.api.Assertions.assertThat(h.get(0).get("changes").get(0).get("to").asText()).isEqualTo("Approved");
        org.assertj.core.api.Assertions.assertThat(h.size()).isEqualTo(4);
    }

    /** Puts the saved rule and tranche ids on a fresh request, as the edit form does — so they are kept, not replaced. */
    private CreateFundProfileRequest keepSavedIds(CreateFundProfileRequest request, long profileId) throws Exception {
        JsonNode rule = body(mockMvc.perform(get("/api/v1/funding/{id}", profileId))).get("terms").get("disbursementRules").get(0);
        var item = request.getDisbursementRules().get(0);
        item.setId(rule.get("id").asLong());
        for (int i = 0; i < item.getTrancheCriteria().size(); i++) {
            item.getTrancheCriteria().get(i).setId(rule.get("trancheCriteria").get(i).get("id").asLong());
        }
        return request;
    }

    @Test
    @WithMockUser
    void testTrancheChangesAreLoggedPerField() throws Exception {
        DonorMaster donor = seedDonor("H2", FundSourceDomicile.DOMESTIC);
        long id = body(send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId()).terms(terms()).build()))
                .get("id").asLong();
        // Move the second tranche's date, keeping the rule and both tranches (matched by id).
        CreateFundProfileRequest moved = keepSavedIds(terms(), id);
        moved.getDisbursementRules().get(0).getTrancheCriteria().get(1).setExpectedReleaseDate(LocalDate.of(2027, 3, 31));
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId()).terms(moved).build())
                .andExpect(status().isOk());

        JsonNode change = history(id).get(0).get("changes");
        org.assertj.core.api.Assertions.assertThat(change.size()).as(change.toString()).isEqualTo(1);
        org.assertj.core.api.Assertions.assertThat(change.get(0).get("section").asText()).startsWith("Tranche 2");
        org.assertj.core.api.Assertions.assertThat(change.get(0).get("field").asText()).isEqualTo("Expected release date");
        org.assertj.core.api.Assertions.assertThat(change.get(0).get("from").asText()).isEqualTo("01 Mar 2027");
        org.assertj.core.api.Assertions.assertThat(change.get(0).get("to").asText()).isEqualTo("31 Mar 2027");
    }
}
