package com.ngo.finance.common.sequence;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class DocumentNumberServiceTest {

    @Test
    void financialYearRunsAprilToMarch() {
        assertThat(DocumentNumberService.financialYearOf(LocalDate.of(2026, 4, 1))).isEqualTo("2026-27");
        assertThat(DocumentNumberService.financialYearOf(LocalDate.of(2026, 11, 20))).isEqualTo("2026-27");
        assertThat(DocumentNumberService.financialYearOf(LocalDate.of(2027, 3, 31))).isEqualTo("2026-27");
        assertThat(DocumentNumberService.financialYearOf(LocalDate.of(2027, 4, 1))).isEqualTo("2027-28");
        assertThat(DocumentNumberService.financialYearOf(LocalDate.of(2099, 6, 1))).isEqualTo("2099-00");
    }
}
