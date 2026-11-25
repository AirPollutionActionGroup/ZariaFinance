package com.ngo.finance.transaction.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** What happened to each row of a credit note CSV import (or would happen, for a dry run). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreditNoteImportResponse {

    private boolean dryRun;
    /** Notes created (0 for a dry run). */
    private int createdCount;
    @Builder.Default
    private List<RowResult> rows = new ArrayList<>();

    public enum Status {
        /** Can be imported as it is. */
        READY,
        /** Can be imported; see the warnings (e.g. a possible duplicate, more than outstanding). */
        WARNING,
        /** Can't be imported; see the errors. */
        ERROR,
        /** Imported in this request (noteCode is set). */
        IMPORTED,
        /** Valid, but not imported in this request (a duplicate left unticked). */
        SKIPPED
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class RowResult {
        private int rowNumber;
        private Status status;
        @Builder.Default
        private List<String> errors = new ArrayList<>();
        @Builder.Default
        private List<String> warnings = new ArrayList<>();
        /** Same date + amount + reference as an existing note, or an earlier row in the file. */
        private boolean duplicate;

        /* What the row resolved to — shown in the preview. */
        private LocalDate date;
        private String book;
        private BigDecimal amount;
        private String currency;
        private BigDecimal foreignAmount;
        private String donorName;
        /** "Receipt 245" — the Tally voucher, when given. */
        private String tallyVoucher;
        private String fundProfileCode;
        private String trancheCode;
        private String receivedVia;

        /** Set once imported. */
        private String noteCode;
    }
}
