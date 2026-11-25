package com.ngo.finance.transaction.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.outflow.dto.RefDto;
import com.ngo.finance.transaction.dto.request.CreateCreditNoteRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/** FC credit notes record the foreign amount and the rate it was converted at (V137). */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
public class CreditNoteForeignAmountIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();

    private static CreateCreditNoteRequest.CreateCreditNoteRequestBuilder note(String inr, ContributionType book) {
        return CreateCreditNoteRequest.builder()
                .date(LocalDate.of(2026, 11, 20))
                .amount(new BigDecimal(inr))
                .book(book)
                .paymentMode(new RefDto("1", "Wire transfer"))
                .reference("SWIFT-1")
                .actor("Tester");
    }

    private ResultActions create(CreateCreditNoteRequest request) throws Exception {
        return mockMvc.perform(post("/api/v1/credit-notes")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)));
    }

    @Test
    @WithMockUser
    void testForeignSideIsSavedAndReturned() throws Exception {
        String body = create(note("88250.00", ContributionType.FC)
                        .currency("usd")
                        .foreignAmount(new BigDecimal("1000.00"))
                        .fxRate(new BigDecimal("88.2500"))
                        .build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.foreignAmount").value(1000.00))
                .andExpect(jsonPath("$.fxRate").value(88.25))
                .andReturn().getResponse().getContentAsString();

        mockMvc.perform(get("/api/v1/credit-notes/{code}", objectMapper.readTree(body).path("id").asText()))
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.foreignAmount").value(1000.00));
    }

    @Test
    @WithMockUser
    void testInrAmountMustBeForeignAmountTimesRate() throws Exception {
        create(note("90000.00", ContributionType.FC)
                        .currency("USD")
                        .foreignAmount(new BigDecimal("1000.00"))
                        .fxRate(new BigDecimal("88.2500"))
                        .build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.amount").exists());
    }

    @Test
    @WithMockUser
    void testForeignSideOnlyOnTheFcBookAndComplete() throws Exception {
        create(note("88250.00", ContributionType.LC)
                        .currency("USD")
                        .foreignAmount(new BigDecimal("1000.00"))
                        .fxRate(new BigDecimal("88.2500"))
                        .build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.currency").exists());

        create(note("88250.00", ContributionType.FC).currency("USD").foreignAmount(new BigDecimal("1000.00")).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.fxRate").exists());
    }

    @Test
    @WithMockUser
    void testInrNoteHasNoForeignSide() throws Exception {
        create(note("500.00", ContributionType.LC).build())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.currency").doesNotExist())
                .andExpect(jsonPath("$.foreignAmount").doesNotExist());
    }
}
