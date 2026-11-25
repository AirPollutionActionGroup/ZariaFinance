package com.ngo.finance.transaction.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Debit notes from a CSV file, already split into rows by the browser. Values
 * stay text so each one can be checked and reported against its row; rows are
 * matched by codes (outflow row id, employee / vendor code, donor and fund
 * codes) and by master names (payment mode, payment group, ledger).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DebitNoteImportRequest {

    /** true: check every row and report, save nothing. false: save the selected rows. */
    private boolean dryRun;

    /** Who is importing (recorded on each note). */
    private String actor;

    /**
     * Row numbers to import (only used when dryRun is false). Null means every
     * row that has no error and isn't a possible duplicate.
     */
    private List<Integer> selected;

    @NotNull(message = "No rows to import")
    @Size(min = 1, max = 500, message = "A file can have 1 to 500 rows")
    @Valid
    @Builder.Default
    private List<Row> rows = new ArrayList<>();

    /** One CSV row, as text. Column names follow the template. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Row {
        /** The row's line number in the file (header = 1), for messages. */
        private int rowNumber;
        private String tallyVoucherNo;
        private String tallyVoucherType;
        private String date;
        private String outflowLineId;
        private String book;
        private String amountInr;
        private String reason;
        private String payeeCategory;
        private String payeeCode;
        private String paidVia;
        private String bankAccount;
        private String paymentGroup;
        private String ledger;
        private String reference;
        private String donorCode;
        private String fundProfileCode;
        private String remarks;
    }
}
