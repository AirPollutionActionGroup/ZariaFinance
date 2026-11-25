package com.ngo.finance.fx.service;

import java.time.LocalDate;
import java.util.Optional;

/**
 * Fetches a reference rate to INR from outside the system. Implemented by
 * {@link FrankfurterFxRateProvider}; kept as an interface so the source can be
 * swapped or stubbed without touching {@link FxRateService}.
 */
public interface FxRateProvider {

    /**
     * The most recent rate for {@code currency} on or before {@code date}, with
     * the date and source it actually came from — or empty when unavailable.
     * Must never throw: a failed lookup only means the user types the rate.
     */
    Optional<ProviderRate> fetchRate(String currency, LocalDate date);
}
