package com.ngo.finance.inflowbudget.dto.response;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One expected receipt row on the Inflow Budget — a donor tranche criterion,
 * enriched with its funding source, donor and book, plus what was received:
 * the credit notes raised against it.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InflowBudgetLineResponse {

    private Long id;
    /** The tranche's permanent code, e.g. FP-2026-001-T2. */
    private String trancheCode;
    /** The funding record (fund profile) this line belongs to — /funding/{fundProfileId}. */
    private Long fundProfileId;
    private String profileCode;
    /** FC book only: whether the donor falls under FCRA. */
    private Boolean fcraApplicable;
    /** FC book only, when the commitment was entered in a foreign currency; null for LC. */
    private ForeignInfo foreign;
    private String line;
    private String fundingSource; // RESTRICTED | UNRESTRICTED
    private String donor;
    private String book; // LC | FC

    private LocalDate expectedDate;
    private BigDecimal expectedAmount;

    /** Date of the latest credit note; null until something is received. */
    private LocalDate actualDate;
    /** Σ credit notes; null until something is received. */
    private BigDecimal actualAmount;

    /** The credit notes' references and codes, oldest first, "; "-joined. */
    private String receiptRef;
    private String receiptNo;

    /** Every instalment (credit note), oldest first. */
    private List<ReceiptItem> receipts;

    /** The foreign-currency side of an FC line: what the INR amounts were derived from. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ForeignInfo {
        private String currency;
        /** This tranche in the foreign currency. */
        private BigDecimal expectedForeignAmount;
        /** The whole commitment, in the foreign currency and in INR. */
        private BigDecimal commitmentForeignAmount;
        private BigDecimal commitmentInrAmount;
        /** ₹ per one unit of currency, and the day / source of that rate. */
        private BigDecimal fxRate;
        private LocalDate fxRateDate;
        private String fxRateSource;
        private String fxRateSourceLabel;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class ReceiptItem {
        private LocalDate date;
        private BigDecimal amount;
        private String reference;
        /** Credit note code, e.g. CN-2026-001. */
        private String creditNoteId;
    }
}
