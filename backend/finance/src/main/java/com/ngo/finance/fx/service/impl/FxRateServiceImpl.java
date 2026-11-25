package com.ngo.finance.fx.service.impl;

import com.ngo.finance.fx.dto.FxRateResponse;
import com.ngo.finance.fx.entity.FxRate;
import com.ngo.finance.fx.repository.FxRateRepository;
import com.ngo.finance.fx.service.FxRateProvider;
import com.ngo.finance.fx.service.FxRateService;
import com.ngo.finance.fx.service.ProviderRate;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Resolves a rate: INR at par, else a live provider lookup (FBIL, else ECB),
 * returned as-is and <b>not stored</b>. Only when the live lookup fails does it
 * read the fx_rate table (seed / manually entered rows) — the exact date, then
 * the latest earlier rate. Any rate dated before the requested date is flagged
 * stale so the form can say which day it is from.
 */
@Slf4j
@Service
@Transactional(readOnly = true)
public class FxRateServiceImpl implements FxRateService {

    static final String INR = "INR";

    @Autowired
    private FxRateRepository fxRateRepository;

    @Autowired
    private FxRateProvider provider;

    @Override
    public FxRateResponse getRate(String currency, LocalDate date) {
        String code = currency == null ? INR : currency.trim().toUpperCase();
        LocalDate on = date != null ? date : LocalDate.now();

        if (INR.equals(code)) {
            return response(code, on, on, BigDecimal.ONE, "PAR", false);
        }

        // 1 · Live: the rate's own date may be days before the request (weekends,
        //     holidays, FBIL publication lag), so it is passed through as-is.
        Optional<ProviderRate> fetched = provider.fetchRate(code, on);
        if (fetched.isPresent()) {
            ProviderRate rate = fetched.get();
            return response(code, on, rate.rateDate(), rate.rateToInr().setScale(4, RoundingMode.HALF_UP),
                    rate.source(), rate.rateDate().isBefore(on));
        }

        // 2 · Live lookup failed — fall back to rows held in fx_rate (never written here).
        Optional<FxRate> exact = fxRateRepository.findByCurrencyAndRateDate(code, on);
        if (exact.isPresent()) {
            FxRate hit = exact.get();
            return response(code, on, hit.getRateDate(), hit.getRateToInr(), hit.getSource(), false);
        }

        List<FxRate> previous = fxRateRepository
                .findByCurrencyAndRateDateLessThanEqualOrderByRateDateDesc(code, on, Limit.of(1));
        if (!previous.isEmpty()) {
            FxRate fallback = previous.get(0);
            return response(code, on, fallback.getRateDate(), fallback.getRateToInr(), fallback.getSource(), true);
        }

        log.warn("No FX rate available for {} on {} — falling back to manual entry", code, on);
        return response(code, on, null, null, "UNAVAILABLE", false);
    }

    private FxRateResponse response(String currency, LocalDate requested, LocalDate rateDate,
            BigDecimal rate, String source, boolean stale) {
        return FxRateResponse.builder()
                .currency(currency)
                .requestedDate(requested)
                .rateDate(rateDate)
                .rateToInr(rate)
                .source(source)
                .stale(stale)
                .build();
    }
}
