package com.ngo.finance.transaction.dto.response;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** What happened to each row of a debit note import (or would happen, on a dry run). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DebitNoteImportResponse {

    private boolean dryRun;

    private int createdCount;

    @Builder.Default
    private List<RowResult> rows = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RowResult {
        private int rowNumber;
        /** Same statuses as the credit note import. */
        private CreditNoteImportResponse.Status status;
        @Builder.Default
        private List<String> errors = new ArrayList<>();
        @Builder.Default
        private List<String> warnings = new ArrayList<>();
        /** Same date + amount + reference as an existing debit note, or an earlier row in the file. */
        private boolean duplicate;

        // What the row resolved to (filled as far as it could be read).
        private LocalDate date;
        private String book;
        private BigDecimal amount;
        private String outflowLineId;
        private String lineName;
        private String payeeCategory;
        private String payeeName;
        private String paidVia;
        private String donorName;
        private String fundProfileCode;
        /** "Payment 118" — the Tally voucher, when given. */
        private String tallyVoucher;
        /** Set once imported. */
        private String noteCode;
    }
}
