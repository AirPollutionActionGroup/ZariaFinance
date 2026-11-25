package com.ngo.finance.fx.service;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * A rate as an external provider returned it.
 *
 * @param rateToInr INR per one unit of the currency
 * @param rateDate  the date the rate actually belongs to — may be earlier than the
 *                  date asked for (weekends, holidays, publication lag)
 * @param source    who published it, recorded on the cached row (e.g. 'FBIL', 'ECB')
 */
public record ProviderRate(BigDecimal rateToInr, LocalDate rateDate, String source) {
}
