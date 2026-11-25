package com.ngo.finance.fx.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Reference rates to INR from Frankfurter (api.frankfurter.dev — free, no key).
 *
 * <ol>
 *   <li><b>FBIL</b> — the official RBI reference rate (computed by Financial
 *       Benchmarks India since July 2018). Quoted for USD, EUR, GBP and JPY only.</li>
 *   <li><b>ECB</b> — the European Central Bank reference rate, for every other
 *       currency, and as the fallback if the FBIL lookup fails.</li>
 * </ol>
 *
 * Both return the latest rate on or before the requested date together with
 * the date it belongs to, which is kept so the form can show it. Future dates
 * are asked as today. Any failure (timeout, 4xx/5xx, bad payload) returns empty
 * so the grant form simply falls back to manual entry.
 *
 * Disable with {@code zaria.fx.frankfurter.enabled=false} (e.g. offline or in tests).
 */
@Slf4j
@Component
public class FrankfurterFxRateProvider implements FxRateProvider {

    static final String SOURCE_FBIL = "FBIL";
    static final String SOURCE_ECB = "ECB";

    /** Currencies FBIL publishes a reference rate for. */
    static final Set<String> FBIL_CURRENCIES = Set.of("USD", "EUR", "GBP", "JPY");

    private final boolean enabled;
    private final RestClient restClient;

    public FrankfurterFxRateProvider(
            @Value("${zaria.fx.frankfurter.enabled:true}") boolean enabled,
            @Value("${zaria.fx.frankfurter.base-url:https://api.frankfurter.dev}") String baseUrl,
            @Value("${zaria.fx.frankfurter.timeout-ms:5000}") int timeoutMs) {
        this.enabled = enabled;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(timeoutMs);
        requestFactory.setReadTimeout(timeoutMs);
        this.restClient = RestClient.builder().baseUrl(baseUrl).requestFactory(requestFactory).build();
    }

    @Override
    public Optional<ProviderRate> fetchRate(String currency, LocalDate date) {
        if (!enabled || currency == null || currency.isBlank()) {
            return Optional.empty();
        }
        String code = currency.trim().toUpperCase(Locale.ROOT);
        LocalDate today = LocalDate.now();
        LocalDate on = date == null || date.isAfter(today) ? today : date;

        if (FBIL_CURRENCIES.contains(code)) {
            Optional<ProviderRate> fbil = fetchFbil(code, on);
            if (fbil.isPresent()) {
                return fbil;
            }
        }
        return fetchEcb(code, on);
    }

    /** GET /v2/providers/fbil/rate/{cur}/inr?date= → {"date","base","quote","rate"}. */
    private Optional<ProviderRate> fetchFbil(String code, LocalDate on) {
        try {
            Map<?, ?> body = restClient.get()
                    .uri("/v2/providers/fbil/rate/{currency}/inr?date={date}", code.toLowerCase(Locale.ROOT), on)
                    .retrieve()
                    .body(Map.class);
            return toRate(body == null ? null : body.get("rate"), body == null ? null : body.get("date"), SOURCE_FBIL, code, on);
        } catch (Exception e) {
            log.warn("FBIL rate lookup failed for {} on {}: {}", code, on, e.getMessage());
            return Optional.empty();
        }
    }

    /** GET /v1/{date}?base={cur}&symbols=INR → {"date","rates":{"INR":x}}. */
    private Optional<ProviderRate> fetchEcb(String code, LocalDate on) {
        try {
            Map<?, ?> body = restClient.get()
                    .uri("/v1/{date}?base={currency}&symbols=INR", on, code)
                    .retrieve()
                    .body(Map.class);
            Object rates = body == null ? null : body.get("rates");
            Object rate = rates instanceof Map<?, ?> r ? r.get("INR") : null;
            return toRate(rate, body == null ? null : body.get("date"), SOURCE_ECB, code, on);
        } catch (Exception e) {
            log.warn("ECB rate lookup failed for {} on {}: {}", code, on, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<ProviderRate> toRate(Object rate, Object date, String source, String code, LocalDate on) {
        if (!(rate instanceof Number number) || !(date instanceof String text)) {
            log.warn("{} response had no usable rate/date for {} on {}", source, code, on);
            return Optional.empty();
        }
        // Via the number's text form so 93.8075 stays exactly 93.8075 (no binary float noise).
        BigDecimal value = new BigDecimal(number.toString());
        LocalDate rateDate = LocalDate.parse(text);
        if (value.signum() <= 0 || rateDate.isAfter(on)) {
            log.warn("{} returned an unusable rate {} dated {} for {} on {}", source, value, rateDate, code, on);
            return Optional.empty();
        }
        return Optional.of(new ProviderRate(value, rateDate, source));
    }
}
