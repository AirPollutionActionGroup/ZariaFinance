package com.ngo.finance.funding.api;

import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.DisbursementRuleItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.GeographyItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.ReleaseCriterionItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.TrancheCriterionItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.UtilisationRuleItem;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.enums.CriterionType;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.enums.FundClass;
import com.ngo.finance.donor.enums.FxRateSource;
import com.ngo.finance.donor.enums.RestrictionRuleType;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.donor.repository.StateRepository;
import com.ngo.finance.masters.designation.repository.DesignationRepository;
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
import org.springframework.transaction.annotation.Transactional;

/**
 * The terms of a funding record (its fund profile): geography, utilisation and
 * disbursement rules, release criteria and the foreign-contribution block —
 * created and updated through /api/v1/funding, the only write path since the
 * old /fund-profiles endpoints were removed. Reading them back goes through
 * /api/v1/funding too (checked at the end).
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class FundingTermsIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DonorRepository donorRepository;

    @Autowired
    private StateRepository stateRepository;

    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;

    @Autowired
    private DesignationRepository designationRepository;

    private Long designationIdFor(String name) {
        return designationRepository.findByName(name)
                .orElseThrow(() -> new IllegalStateException("No designation named " + name))
                .getId();
    }

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private DonorMaster seedDonor(String suffix) {
        return donorRepository.save(DonorMaster.builder()
                .donorCode("DN-FP-" + suffix)
                .donorName("Fund Profile Donor " + suffix)
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("fundprofile" + suffix + "@example.com")
                .isActive(true)
                .build());
    }

    private Long seededStateId() {
        return stateRepository.findAll().stream().findFirst()
                .orElseThrow(() -> new IllegalStateException("No seeded state found"))
                .getId();
    }

    private CreateFundProfileRequest.CreateFundProfileRequestBuilder baseProfile() {
        return CreateFundProfileRequest.builder()
                .fundMode(FundMode.UNRESTRICTED)
                .fundClass(FundClass.CLASS_C_UNRESTRICTED)
                .purpose("Fund profile test");
    }

    private static TrancheCriterionItem onSigningCriterion(String amount, LocalDate date, boolean finalTranche) {
        return TrancheCriterionItem.builder()
                .amountCriteria(new BigDecimal(amount))
                .expectedReleaseDate(date)
                .isFinalTranche(finalTranche)
                .criteria(List.of(ReleaseCriterionItem.builder()
                        .releaseCriteria(CriterionType.ON_SIGNING)
                        .build()))
                .build();
    }

    /** POST /api/v1/funding with terms only (no agreement). */
    private org.springframework.test.web.servlet.ResultActions createTerms(DonorMaster donor,
            CreateFundProfileRequest terms) throws Exception {
        return mockMvc.perform(post("/api/v1/funding")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                        FundingRequest.builder().donorId(donor.getId()).terms(terms).build())));
    }

    /** PUT /api/v1/funding/{id} with terms only. */
    private org.springframework.test.web.servlet.ResultActions updateTerms(long id, DonorMaster donor,
            CreateFundProfileRequest terms) throws Exception {
        return mockMvc.perform(put("/api/v1/funding/{id}", id)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(
                        FundingRequest.builder().donorId(donor.getId()).terms(terms).build())));
    }

    @Test
    @WithMockUser
    void testCreateWithGeographyUtilisationAndDisbursementRule() throws Exception {
        DonorMaster donor = seedDonor("T1");
        Long stateId = seededStateId();

        CreateFundProfileRequest request = baseProfile()
                .geographies(List.of(GeographyItem.builder().stateId(stateId).build()))
                .utilisationRules(List.of(UtilisationRuleItem.builder()
                        .ruleType(RestrictionRuleType.ADMIN_OVERHEAD_COST)
                        .limitPercentage(new BigDecimal("5.00"))
                        .build()))
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("250000.00"))
                        .disbursementType(DisbursementType.TRANCHES)
                        .trancheCriteria(List.of(
                                onSigningCriterion("150000.00", LocalDate.of(2026, 4, 1), false),
                                onSigningCriterion("100000.00", LocalDate.of(2026, 7, 1), true)))
                        .build()))
                .build();

        createTerms(donor, request)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.terms.profileCode").value(matchesPattern("FP-\\d{4}-\\d{3,}")))
                .andExpect(jsonPath("$.terms.geographies.length()").value(1))
                .andExpect(jsonPath("$.terms.geographies[0].stateId").value(stateId))
                .andExpect(jsonPath("$.terms.utilisationRules[0].ruleType").value("ADMIN_OVERHEAD_COST"))
                .andExpect(jsonPath("$.terms.disbursementRules.length()").value(1))
                .andExpect(jsonPath("$.terms.disbursementRules[0].totalAmount").value(250000.00))
                .andExpect(jsonPath("$.terms.disbursementRules[0].allocatedAmount").value(250000.00))
                .andExpect(jsonPath("$.terms.disbursementRules[0].balanced").value(true))
                .andExpect(jsonPath("$.terms.disbursementRules[0].trancheCriteria.length()").value(2))
                .andExpect(jsonPath("$.terms.disbursementRules[0].trancheCriteria[0].expectedReleaseDate")
                        .value("2026-04-01"));
    }

    @Test
    @WithMockUser
    void testUpdateReplacesTheChildCollections() throws Exception {
        DonorMaster donor = seedDonor("T2");
        Long stateId = seededStateId();

        CreateFundProfileRequest initial = baseProfile()
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("400000.00"))
                        .disbursementType(DisbursementType.LUMP_SUM)
                        .receivingDate(LocalDate.of(2026, 4, 1))
                        .trancheCriteria(List.of(onSigningCriterion("400000.00", LocalDate.of(2026, 4, 1), true)))
                        .build()))
                .build();

        String created = createTerms(donor, initial)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long profileId = objectMapper.readTree(created).path("id").asLong();
        String profileCode = objectMapper.readTree(created).path("terms").path("profileCode").asText();

        CreateFundProfileRequest updated = baseProfile()
                .geographies(List.of(GeographyItem.builder().stateId(stateId).build()))
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("125000.00"))
                        .disbursementType(DisbursementType.TRANCHES)
                        .trancheCriteria(List.of(
                                onSigningCriterion("50000.00", LocalDate.of(2026, 8, 1), false),
                                onSigningCriterion("75000.00", LocalDate.of(2026, 10, 1), true)))
                        .build()))
                .build();

        updateTerms(profileId, donor, updated)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terms.profileCode").value(profileCode))
                .andExpect(jsonPath("$.terms.geographies.length()").value(1))
                .andExpect(jsonPath("$.terms.disbursementRules.length()").value(1))
                .andExpect(jsonPath("$.terms.disbursementRules[0].disbursementType").value("TRANCHES"))
                .andExpect(jsonPath("$.terms.disbursementRules[0].totalAmount").value(125000.00))
                .andExpect(jsonPath("$.terms.disbursementRules[0].trancheCriteria.length()").value(2));
    }

    private CreateFundProfileRequest lumpSumProfile(String purpose) {
        return baseProfile()
                .purpose(purpose)
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("90000.00"))
                        .disbursementType(DisbursementType.LUMP_SUM)
                        .receivingDate(LocalDate.of(2026, 4, 1))
                        .trancheCriteria(List.of(onSigningCriterion("90000.00", LocalDate.of(2026, 4, 1), true)))
                        .build()))
                .build();
    }

    @Test
    @WithMockUser
    void testReadBackThroughFundingAndOldEndpointsAreGone() throws Exception {
        DonorMaster donor = seedDonor("L1");
        List<Long> ids = new java.util.ArrayList<>();
        for (String purpose : List.of("Read A", "Read B")) {
            String body = createTerms(donor, lumpSumProfile(purpose))
                    .andExpect(status().isCreated())
                    .andReturn().getResponse().getContentAsString();
            ids.add(objectMapper.readTree(body).path("id").asLong());
        }

        // Read back through /api/v1/funding: the donor's records, and one record's terms.
        mockMvc.perform(get("/api/v1/funding").param("donorId", donor.getId().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/v1/funding/{id}", ids.get(0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.terms.purpose").value("Read A"));

        // The old /fund-profiles endpoints are gone.
        mockMvc.perform(get("/api/v1/donors/{donorId}/fund-profiles", donor.getId()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/fund-profiles/{id}", ids.get(0)))
                .andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser
    void testRejectsAProfileWithNoDisbursementRule() throws Exception {
        DonorMaster donor = seedDonor("T3");

        createTerms(donor, baseProfile().build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules']").exists());
    }

    @Test
    @WithMockUser
    void testRejectsANonPositiveTrancheAmount() throws Exception {
        DonorMaster donor = seedDonor("T4");

        CreateFundProfileRequest request = baseProfile()
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(BigDecimal.ZERO)
                        .disbursementType(DisbursementType.LUMP_SUM)
                        .trancheCriteria(List.of(onSigningCriterion("0.00", null, true)))
                        .build()))
                .build();

        createTerms(donor, request)
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    void testOtherCustomRuleTypeRequiresOtherRuleType() throws Exception {
        DonorMaster donor = seedDonor("T5");

        CreateFundProfileRequest request = baseProfile()
                .utilisationRules(List.of(UtilisationRuleItem.builder()
                        .ruleType(RestrictionRuleType.OTHER_CUSTOM)
                        .limitPercentage(new BigDecimal("10.00"))
                        .build()))
                .build();

        createTerms(donor, request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.utilisationRules.0.otherRuleType']").exists());
    }

    @Test
    @WithMockUser
    void testMilestoneBasedCriterionRequiresMilestoneFields() throws Exception {
        DonorMaster donor = seedDonor("T6");

        CreateFundProfileRequest request = baseProfile()
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("100000.00"))
                        .disbursementType(DisbursementType.LUMP_SUM)
                        .trancheCriteria(List.of(TrancheCriterionItem.builder()
                                .amountCriteria(new BigDecimal("100000.00"))
                                .criteria(List.of(ReleaseCriterionItem.builder()
                                        .releaseCriteria(CriterionType.MILESTONE_BASED)
                                        .build()))
                                .build()))
                        .build()))
                .build();

        createTerms(donor, request)
                .andExpect(status().isBadRequest())
                .andExpect(
                        jsonPath("$.errors['terms.disbursementRules.0.trancheCriteria.0.criteria.0.milestoneName']")
                                .exists())
                .andExpect(
                        jsonPath(
                                "$.errors['terms.disbursementRules.0.trancheCriteria.0.criteria.0.verificationSignOffRole']")
                                .exists());
    }

    @Test
    @WithMockUser
    void testReminderOnNonHumanActionedCriterionRejected() throws Exception {
        DonorMaster donor = seedDonor("T7");

        CreateFundProfileRequest request = baseProfile()
                .disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("100000.00"))
                        .disbursementType(DisbursementType.LUMP_SUM)
                        .trancheCriteria(List.of(TrancheCriterionItem.builder()
                                .amountCriteria(new BigDecimal("100000.00"))
                                .criteria(List.of(ReleaseCriterionItem.builder()
                                        .releaseCriteria(CriterionType.ON_SIGNING)
                                        .remindSomeone(true)
                                        .responsibleRoleId(designationIdFor("CFO"))
                                        .reminderLeadTime(7)
                                        .build()))
                                .build()))
                        .build()))
                .build();

        createTerms(donor, request)
                .andExpect(status().isBadRequest())
                .andExpect(
                        jsonPath("$.errors['terms.disbursementRules.0.trancheCriteria.0.criteria.0.remindSomeone']")
                                .exists());
    }

    // ---- Foreign contribution (FC book) — V131 / V132 ----

    private DonorMaster seedDonor(String suffix, FundSourceDomicile domicile) {
        DonorMaster donor = seedDonor(suffix);
        donor.setFundSourceDomicile(domicile);
        return donorRepository.save(donor);
    }

    private static TrancheCriterionItem foreignTranche(String inr, String foreign, LocalDate date, boolean last) {
        TrancheCriterionItem tranche = onSigningCriterion(inr, date, last);
        tranche.setForeignAmount(new BigDecimal(foreign));
        return tranche;
    }

    /** USD 10,000 at ₹88.50 = ₹885,000, in two tranches of USD 6,000 + 4,000. */
    private static DisbursementRuleItem.DisbursementRuleItemBuilder usdCommitment() {
        return DisbursementRuleItem.builder()
                .totalAmount(new BigDecimal("885000.00"))
                .disbursementType(DisbursementType.TRANCHES)
                .currency("usd")
                .foreignAmount(new BigDecimal("10000.00"))
                .fxRate(new BigDecimal("88.5000"))
                .fxRateDate(LocalDate.of(2026, 11, 11))
                .fxRateSource(FxRateSource.FBIL)
                .trancheCriteria(List.of(
                        foreignTranche("531000.00", "6000.00", LocalDate.of(2026, 12, 1), false),
                        foreignTranche("354000.00", "4000.00", LocalDate.of(2027, 3, 1), true)));
    }

    @Test
    @WithMockUser
    void testForeignContributionIsSavedAndReturned() throws Exception {
        DonorMaster donor = seedDonor("FC1", FundSourceDomicile.FOREIGN);

        createTerms(donor, baseProfile().disbursementRules(List.of(usdCommitment().build())).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.terms.disbursementRules[0].foreign").value(true))
                .andExpect(jsonPath("$.terms.disbursementRules[0].currency").value("USD"))
                .andExpect(jsonPath("$.terms.disbursementRules[0].foreignAmount").value(10000.00))
                .andExpect(jsonPath("$.terms.disbursementRules[0].fxRate").value(88.5))
                .andExpect(jsonPath("$.terms.disbursementRules[0].fxRateDate").value("2026-11-11"))
                .andExpect(jsonPath("$.terms.disbursementRules[0].fxRateSource").value("FBIL"))
                .andExpect(jsonPath("$.terms.disbursementRules[0].trancheCriteria[0].foreignAmount").value(6000.00))
                .andExpect(jsonPath("$.terms.disbursementRules[0].trancheCriteria[1].foreignAmount").value(4000.00));
    }

    @Test
    @WithMockUser
    void testInflowLineShowsTheForeignSide() throws Exception {
        DonorMaster donor = seedDonor("FC7", FundSourceDomicile.FOREIGN);
        String body = createTerms(donor, baseProfile().disbursementRules(List.of(usdCommitment().build())).build())
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        com.fasterxml.jackson.databind.JsonNode rule = objectMapper.readTree(body)
                .path("terms").path("disbursementRules").get(0);
        long first = rule.path("trancheCriteria").get(0).path("id").asLong();

        mockMvc.perform(get("/api/v1/inflow-budget/" + first))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.book").value("FC"))
                .andExpect(jsonPath("$.fundProfileId").value(objectMapper.readTree(body).path("id").asLong()))
                .andExpect(jsonPath("$.foreign.currency").value("USD"))
                .andExpect(jsonPath("$.foreign.expectedForeignAmount").value(6000.00))
                .andExpect(jsonPath("$.foreign.commitmentForeignAmount").value(10000.00))
                .andExpect(jsonPath("$.foreign.commitmentInrAmount").value(885000.00))
                .andExpect(jsonPath("$.foreign.fxRate").value(88.5))
                .andExpect(jsonPath("$.foreign.fxRateDate").value("2026-11-11"))
                .andExpect(jsonPath("$.foreign.fxRateSource").value("FBIL"))
                .andExpect(jsonPath("$.foreign.fxRateSourceLabel").value("RBI/FBIL reference rate"));
    }

    @Test
    @WithMockUser
    void testInrInflowLineHasNoForeignSide() throws Exception {
        DonorMaster donor = seedDonor("FC8", FundSourceDomicile.DOMESTIC);
        String body = createTerms(donor, lumpSumProfile("INR line"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long tranche = objectMapper.readTree(body).path("terms").path("disbursementRules").get(0)
                .path("trancheCriteria").get(0).path("id").asLong();

        mockMvc.perform(get("/api/v1/inflow-budget/" + tranche))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.foreign").doesNotExist());
    }

    @Test
    @WithMockUser
    void testInrCommitmentHasNoForeignFields() throws Exception {
        DonorMaster donor = seedDonor("FC2", FundSourceDomicile.DOMESTIC);

        createTerms(donor, baseProfile().disbursementRules(List.of(DisbursementRuleItem.builder()
                        .totalAmount(new BigDecimal("100000.00"))
                        .disbursementType(DisbursementType.TRANCHES)
                        .trancheCriteria(List.of(onSigningCriterion("100000.00", LocalDate.of(2026, 12, 1), true)))
                        .build())).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.terms.disbursementRules[0].foreign").value(false))
                .andExpect(jsonPath("$.terms.disbursementRules[0].currency").doesNotExist());
    }

    @Test
    @WithMockUser
    void testRejectsTotalThatIsNotForeignAmountTimesRate() throws Exception {
        DonorMaster donor = seedDonor("FC3", FundSourceDomicile.FOREIGN);

        createTerms(donor, baseProfile().disbursementRules(List.of(
                        usdCommitment().totalAmount(new BigDecimal("900000.00")).build())).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.totalAmount']").exists());
    }

    @Test
    @WithMockUser
    void testRejectsPartialForeignFields() throws Exception {
        DonorMaster donor = seedDonor("FC4", FundSourceDomicile.FOREIGN);

        createTerms(donor, baseProfile().disbursementRules(List.of(
                        usdCommitment().fxRateDate(null).fxRateSource(null).build())).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.fxRateDate']").exists())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.fxRateSource']").exists());
    }

    @Test
    @WithMockUser
    void testRejectsForeignTranchesOverTheCommitment() throws Exception {
        DonorMaster donor = seedDonor("FC5", FundSourceDomicile.FOREIGN);

        createTerms(donor, baseProfile().disbursementRules(List.of(usdCommitment()
                        .trancheCriteria(List.of(
                                foreignTranche("531000.00", "6000.00", LocalDate.of(2026, 12, 1), false),
                                foreignTranche("354000.00", "5000.00", LocalDate.of(2027, 3, 1), true)))
                        .build())).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.trancheCriteria']").exists());
    }

    @Test
    @WithMockUser
    void testRejectsForeignCurrencyForADomesticDonor() throws Exception {
        DonorMaster donor = seedDonor("FC6", FundSourceDomicile.DOMESTIC);

        createTerms(donor, baseProfile().disbursementRules(List.of(usdCommitment().build())).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.currency']").exists());
    }

    // ---- Cities in geographies — V135 ----

    @Autowired
    private com.ngo.finance.donor.repository.CityRepository cityRepository;

    /** Any seeded city with its state, and some other state it is not in. */
    private long[] cityStateAndOtherState() {
        com.ngo.finance.donor.entity.CityMaster city = cityRepository.findByIsActive(true).stream()
                .filter(c -> c.getDistrict() != null && c.getDistrict().getState() != null)
                .findFirst().orElseThrow(() -> new IllegalStateException("No seeded city"));
        long stateId = city.getDistrict().getState().getId();
        long other = stateRepository.findAll().stream().map(s -> s.getId())
                .filter(id -> id != stateId).findFirst().orElseThrow();
        return new long[] { city.getId(), stateId, other };
    }

    @Test
    @WithMockUser
    void testCityIsSavedWithItsState() throws Exception {
        DonorMaster donor = seedDonor("G1");
        long[] ids = cityStateAndOtherState();

        CreateFundProfileRequest withCity = lumpSumProfile("Cities");
        withCity.setGeographies(List.of(
                GeographyItem.builder().stateId(ids[1]).cityId(ids[0]).build(),
                GeographyItem.builder().stateId(ids[2]).build()));

        createTerms(donor, withCity)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.terms.geographies.length()").value(2))
                .andExpect(jsonPath("$.terms.geographies[?(@.cityId == " + ids[0] + ")].stateId").value((int) ids[1]))
                .andExpect(jsonPath("$.terms.geographies[?(@.cityId == " + ids[0] + ")].cityName").isNotEmpty())
                .andExpect(jsonPath("$.terms.geographies[?(@.stateId == " + ids[2] + ")].cityId").value(
                        org.hamcrest.Matchers.contains(org.hamcrest.Matchers.nullValue())));
    }

    @Test
    @WithMockUser
    void testCityMustBeInItsState() throws Exception {
        DonorMaster donor = seedDonor("G2");
        long[] ids = cityStateAndOtherState();
        CreateFundProfileRequest wrongState = lumpSumProfile("Wrong state");
        wrongState.setGeographies(List.of(GeographyItem.builder().stateId(ids[2]).cityId(ids[0]).build()));

        createTerms(donor, wrongState)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.geographies']").exists());
    }

    @Test
    @WithMockUser
    void testStateIsWholeOrByCityNotBoth() throws Exception {
        DonorMaster donor = seedDonor("G3");
        long[] ids = cityStateAndOtherState();
        CreateFundProfileRequest both = lumpSumProfile("Both");
        both.setGeographies(List.of(
                GeographyItem.builder().stateId(ids[1]).build(),
                GeographyItem.builder().stateId(ids[1]).cityId(ids[0]).build()));

        createTerms(donor, both)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.geographies']").exists());
    }
}
