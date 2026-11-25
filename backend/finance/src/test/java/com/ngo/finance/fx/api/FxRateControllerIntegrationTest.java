package com.ngo.finance.fx.api;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.ngo.finance.fx.entity.FxRate;
import com.ngo.finance.fx.repository.FxRateRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The rate lookup behind the grant form's FX field. Live Frankfurter lookups
 * are switched off here (no network in tests), so these exercise the cached-row
 * paths: INR at par, an exact hit, a stale fallback, and no rate at all.
 */
@SpringBootTest
@TestPropertySource(properties = "zaria.fx.frankfurter.enabled=false")
@AutoConfigureMockMvc
@Transactional
public class FxRateControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FxRateRepository fxRateRepository;

    @Test
    @WithMockUser
    void testInrReturnsParWithoutALookup() throws Exception {
        mockMvc.perform(get("/api/v1/fx-rates").param("currency", "INR").param("date", "2026-07-26"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rateToInr").value(1))
                .andExpect(jsonPath("$.source").value("PAR"))
                .andExpect(jsonPath("$.stale").value(false));
    }

    @Test
    @WithMockUser
    void testExactCachedRateIsServedAsIs() throws Exception {
        fxRateRepository.save(FxRate.builder()
                .currency("TST")
                .rateDate(LocalDate.of(2026, 5, 10))
                .rateToInr(new BigDecimal("12.3400"))
                .source("MANUAL")
                .build());

        mockMvc.perform(get("/api/v1/fx-rates").param("currency", "TST").param("date", "2026-05-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rateToInr").value(12.34))
                .andExpect(jsonPath("$.rateDate").value("2026-05-10"))
                .andExpect(jsonPath("$.source").value("MANUAL"))
                .andExpect(jsonPath("$.stale").value(false));
    }

    @Test
    @WithMockUser
    void testFallsBackToTheLatestEarlierRateAndFlagsItStale() throws Exception {
        fxRateRepository.save(FxRate.builder()
                .currency("TSU")
                .rateDate(LocalDate.of(2026, 5, 1))
                .rateToInr(new BigDecimal("10.0000"))
                .source("MANUAL")
                .build());
        fxRateRepository.save(FxRate.builder()
                .currency("TSU")
                .rateDate(LocalDate.of(2026, 5, 20))
                .rateToInr(new BigDecimal("11.0000"))
                .source("MANUAL")
                .build());

        // Asked for a later date: the most recent earlier rate wins, marked stale.
        mockMvc.perform(get("/api/v1/fx-rates").param("currency", "TSU").param("date", "2026-06-15"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rateToInr").value(11.0))
                .andExpect(jsonPath("$.rateDate").value("2026-05-20"))
                .andExpect(jsonPath("$.requestedDate").value("2026-06-15"))
                .andExpect(jsonPath("$.stale").value(true));
    }

    @Test
    @WithMockUser
    void testUnknownCurrencyReturnsNullRateRatherThanAnError() throws Exception {
        // 200 with a null rate so the form falls back to manual entry quietly.
        mockMvc.perform(get("/api/v1/fx-rates").param("currency", "ZZZ").param("date", "2026-07-26"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rateToInr").value(nullValue()))
                .andExpect(jsonPath("$.source").value("UNAVAILABLE"));
    }

    @Test
    @WithMockUser
    void testCurrencyIsCaseInsensitiveAndTheRowsSourceIsReturned() throws Exception {
        // Its own row, not the V42 seed rows: those may have been removed from a
        // database (the table is only a fallback), and the test must not depend on them.
        fxRateRepository.findByCurrencyAndRateDate("USD", LocalDate.of(2026, 1, 1))
                .ifPresent(fxRateRepository::delete);
        // Write the delete now: Hibernate would otherwise run the insert below first
        // and hit the (currency, rate_date) unique key on a database that has the seed row.
        fxRateRepository.flush();
        fxRateRepository.save(FxRate.builder()
                .currency("USD")
                .rateDate(LocalDate.of(2026, 1, 1))
                .rateToInr(new BigDecimal("85.0000"))
                .source("SEED")
                .build());

        mockMvc.perform(get("/api/v1/fx-rates").param("currency", "usd").param("date", "2026-01-01"))
                .andExpect(status().isOk())
                // Case-insensitive: the form uppercases, but the API shouldn't rely on it.
                .andExpect(jsonPath("$.currency").value("USD"))
                .andExpect(jsonPath("$.source").value("SEED"));
    }
}
