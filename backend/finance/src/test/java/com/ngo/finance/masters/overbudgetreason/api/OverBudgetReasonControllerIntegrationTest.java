package com.ngo.finance.masters.overbudgetreason.api;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/** Masters → Over-budget reasons: the list debit notes pick from when a line goes over budget. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser
public class OverBudgetReasonControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ResultActions send(MockHttpServletRequestBuilder builder, Object body) throws Exception {
        return mockMvc.perform(builder.with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
    }

    @Test
    void testSeededReasonsAreListed() throws Exception {
        mockMvc.perform(get("/api/v1/over-budget-reasons"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].name").value(hasItem("Additional charge")))
                .andExpect(jsonPath("$[*].name").value(hasItem("Tax / GST adjustment")));
    }

    @Test
    void testCreateEditDeactivate() throws Exception {
        String body = send(post("/api/v1/over-budget-reasons"),
                Map.of("name", "Emergency purchase", "description", "Bought urgently outside the plan"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.usedCount").value(0))
                .andReturn().getResponse().getContentAsString();
        long id = objectMapper.readTree(body).path("id").asLong();

        // Names are unique, ignoring case.
        send(post("/api/v1/over-budget-reasons"), Map.of("name", "emergency PURCHASE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists());
        send(post("/api/v1/over-budget-reasons"), Map.of("name", " ")).andExpect(status().isBadRequest());

        send(put("/api/v1/over-budget-reasons/{id}", id), Map.of("name", "Emergency buy", "description", ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Emergency buy"))
                .andExpect(jsonPath("$.description").doesNotExist());

        mockMvc.perform(patch("/api/v1/over-budget-reasons/{id}/deactivate", id).with(csrf()))
                .andExpect(status().isNoContent());
        // The debit note form only gets active ones.
        mockMvc.perform(get("/api/v1/over-budget-reasons").param("activeOnly", "true"))
                .andExpect(jsonPath("$[*].name").value(not(hasItem("Emergency buy"))));
        mockMvc.perform(get("/api/v1/over-budget-reasons/{id}", id))
                .andExpect(jsonPath("$.status").value("INACTIVE"));
    }
}
