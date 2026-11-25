package com.ngo.finance.transaction.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

/** Rupee amounts in import messages read the way the screens show them. */
class CreditNoteImportFormatTest {

    @Test
    void indianGrouping() {
        assertThat(ImportSupport.inr(new BigDecimal("999"))).isEqualTo("₹999");
        assertThat(ImportSupport.inr(new BigDecimal("10000.00"))).isEqualTo("₹10,000");
        assertThat(ImportSupport.inr(new BigDecimal("100000"))).isEqualTo("₹1,00,000");
        assertThat(ImportSupport.inr(new BigDecimal("46882.50"))).isEqualTo("₹46,882.5");
        assertThat(ImportSupport.inr(new BigDecimal("12345678.25"))).isEqualTo("₹1,23,45,678.25");
        assertThat(ImportSupport.inr(BigDecimal.ZERO)).isEqualTo("₹0");
    }

    @Test
    void westernGroupingForForeignAmounts() {
        assertThat(ImportSupport.grouped(new BigDecimal("1234567"), false)).isEqualTo("1,234,567");
        assertThat(ImportSupport.grouped(new BigDecimal("6000.00"), false)).isEqualTo("6,000");
    }
}
