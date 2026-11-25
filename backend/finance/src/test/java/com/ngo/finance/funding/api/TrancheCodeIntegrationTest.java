package com.ngo.finance.funding.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.DisbursementRuleItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.ReleaseCriterionItem;
import com.ngo.finance.donor.dto.request.CreateFundProfileRequest.TrancheCriterionItem;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.enums.CriterionType;
import com.ngo.finance.donor.enums.DisbursementType;
import com.ngo.finance.donor.enums.FundClass;
import com.ngo.finance.donor.enums.FundMode;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import com.ngo.finance.outflow.dto.RefDto;
import com.ngo.finance.transaction.dto.request.CreateCreditNoteRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
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
 * Tranche codes ({profileCode}-T{n}) and tranche identity: an edit keeps a
 * tranche's id and code, numbers are never reused, and a tranche with money
 * received against it can't be removed.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class TrancheCodeIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private DonorRepository donorRepository;

    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private DonorMaster seedDonor(String suffix) {
        return donorRepository.save(DonorMaster.builder()
                .donorCode("DN-TC-" + suffix)
                .donorName("Tranche Code Donor " + suffix)
                .donorType(donorTypeMasterRepository.searchByName("Corporate CSR").get(0))
                .email("tranchecode" + suffix + "@example.com")
                .fundSourceDomicile(FundSourceDomicile.DOMESTIC)
                .isActive(true)
                .build());
    }

    private static TrancheCriterionItem tranche(Long id, String amount, LocalDate date, boolean last) {
        return TrancheCriterionItem.builder()
                .id(id)
                .amountCriteria(new BigDecimal(amount))
                .expectedReleaseDate(date)
                .isFinalTranche(last)
                .criteria(List.of(ReleaseCriterionItem.builder().releaseCriteria(CriterionType.ON_SIGNING).build()))
                .build();
    }

    private static CreateFundProfileRequest terms(Long ruleId, List<TrancheCriterionItem> tranches) {
        BigDecimal total = tranches.stream().map(TrancheCriterionItem::getAmountCriteria)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return CreateFundProfileRequest.builder()
                .fundMode(FundMode.UNRESTRICTED)
                .fundClass(FundClass.CLASS_C_UNRESTRICTED)
                .programmeTied(false)
                .purpose("Tranche codes")
                .disbursementRules(new ArrayList<>(List.of(DisbursementRuleItem.builder()
                        .id(ruleId)
                        .totalAmount(total)
                        .disbursementType(DisbursementType.TRANCHES)
                        .trancheCriteria(new ArrayList<>(tranches))
                        .build())))
                .build();
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder,
            Object body) throws Exception {
        return mockMvc.perform(builder.with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    private JsonNode rule(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString())
                .path("terms").path("disbursementRules").get(0);
    }

    @Test
    @WithMockUser
    void testCodesAreAssignedKeptAndNeverReused() throws Exception {
        DonorMaster donor = seedDonor("A");
        ResultActions created = send(post("/api/v1/funding"), FundingRequest.builder().donorId(donor.getId())
                .terms(terms(null, List.of(
                        // Sent out of date order: numbering follows the release date.
                        tranche(null, "40000", LocalDate.of(2027, 3, 1), true),
                        tranche(null, "60000", LocalDate.of(2026, 12, 1), false))))
                .build())
                .andExpect(status().isCreated());
        JsonNode body = objectMapper.readTree(created.andReturn().getResponse().getContentAsString());
        long id = body.path("id").asLong();
        String profileCode = body.path("terms").path("profileCode").asText();
        JsonNode rule = body.path("terms").path("disbursementRules").get(0);
        long ruleId = rule.path("id").asLong();
        JsonNode t1 = rule.path("trancheCriteria").get(0); // response is in date order
        JsonNode t2 = rule.path("trancheCriteria").get(1);
        org.assertj.core.api.Assertions.assertThat(t1.path("trancheCode").asText()).isEqualTo(profileCode + "-T1");
        org.assertj.core.api.Assertions.assertThat(t2.path("trancheCode").asText()).isEqualTo(profileCode + "-T2");

        // Edit: keep T1 (changed amount), drop T2, add a new one → T1 keeps id + code; the new one is T3.
        JsonNode after = rule(send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId())
                .terms(terms(ruleId, List.of(
                        tranche(t1.path("id").asLong(), "70000", LocalDate.of(2026, 12, 1), false),
                        tranche(null, "30000", LocalDate.of(2027, 6, 1), true))))
                .build())
                .andExpect(status().isOk()));
        org.assertj.core.api.Assertions.assertThat(after.path("id").asLong()).isEqualTo(ruleId);
        JsonNode kept = after.path("trancheCriteria").get(0);
        JsonNode added = after.path("trancheCriteria").get(1);
        org.assertj.core.api.Assertions.assertThat(kept.path("id").asLong()).isEqualTo(t1.path("id").asLong());
        org.assertj.core.api.Assertions.assertThat(kept.path("trancheCode").asText()).isEqualTo(profileCode + "-T1");
        org.assertj.core.api.Assertions.assertThat(kept.path("amountCriteria").decimalValue())
                .isEqualByComparingTo("70000");
        org.assertj.core.api.Assertions.assertThat(added.path("trancheCode").asText()).isEqualTo(profileCode + "-T3");
    }

    @Test
    @WithMockUser
    void testTrancheWithMoneyReceivedCannotBeRemoved() throws Exception {
        DonorMaster donor = seedDonor("B");
        JsonNode body = objectMapper.readTree(send(post("/api/v1/funding"), FundingRequest.builder()
                .donorId(donor.getId())
                .terms(terms(null, List.of(
                        tranche(null, "600", LocalDate.of(2026, 9, 1), false),
                        tranche(null, "400", LocalDate.of(2026, 12, 1), true))))
                .build())
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        long id = body.path("id").asLong();
        JsonNode rule = body.path("terms").path("disbursementRules").get(0);
        JsonNode first = rule.path("trancheCriteria").get(0);
        JsonNode second = rule.path("trancheCriteria").get(1);

        // Money received against the second tranche.
        send(post("/api/v1/credit-notes"), CreateCreditNoteRequest.builder()
                .date(LocalDate.of(2026, 9, 29))
                .amount(new BigDecimal("250"))
                .book(ContributionType.LC)
                .paymentMode(new RefDto("1", "NEFT"))
                .donor(new RefDto(String.valueOf(donor.getId()), donor.getDonorName()))
                .fundProfile(new RefDto(String.valueOf(id), "Tranche code fund"))
                .disbursementType("Tranches")
                .tranche(new RefDto(second.path("id").asText(), second.path("trancheCode").asText()))
                .reference("UTR-TC")
                .actor("Tester")
                .build())
                .andExpect(status().isCreated());

        // The inflow budget line shows the code.
        mockMvc.perform(get("/api/v1/inflow-budget/" + second.path("id").asLong()))
                .andExpect(jsonPath("$.trancheCode").value(second.path("trancheCode").asText()));

        // Removing it is refused, naming the tranche…
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId())
                .terms(terms(rule.path("id").asLong(), List.of(
                        tranche(first.path("id").asLong(), "1000", LocalDate.of(2026, 9, 1), true))))
                .build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors['terms.disbursementRules.0.trancheCriteria']").value(
                        org.hamcrest.Matchers.containsString(second.path("trancheCode").asText())));

        // …while editing it (same id) is fine and keeps the money linked.
        send(put("/api/v1/funding/{id}", id), FundingRequest.builder().donorId(donor.getId())
                .terms(terms(rule.path("id").asLong(), List.of(
                        tranche(first.path("id").asLong(), "600", LocalDate.of(2026, 9, 1), false),
                        tranche(second.path("id").asLong(), "500", LocalDate.of(2027, 1, 15), true))))
                .build())
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/inflow-budget/" + second.path("id").asLong()))
                .andExpect(jsonPath("$.actualAmount").value(250))
                .andExpect(jsonPath("$.expectedAmount").value(500));
    }
}
