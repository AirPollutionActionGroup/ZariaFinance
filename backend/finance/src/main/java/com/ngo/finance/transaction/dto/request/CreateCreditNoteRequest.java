package com.ngo.finance.transaction.dto.request;

import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.outflow.dto.RefDto;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Record money that came back, optionally returned to a donor fund.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateCreditNoteRequest {

    @NotNull(message = "Credit note date is required")
    private LocalDate date;

    @NotNull(message = "Amount is required")
    @DecimalMin(value = "0.01", message = "Amount must be greater than zero")
    @Digits(integer = 16, fraction = 2, message = "Amount has too many digits")
    private BigDecimal amount;

    @NotNull(message = "Select a book")
    private ContributionType book;

    @NotNull(message = "Select how the money was received")
    private RefDto paymentMode;

    private RefDto bankAccount;

    private RefDto group;

    private RefDto ledger;

    private RefDto donor;

    private RefDto fundProfile;

    private RefDto grant;

    /** 'Lump Sum' | 'Tranches' — snapshot of the fund profile's rule. */
    @Size(max = 40)
    private String disbursementType;

    private RefDto tranche;

    @Size(max = 255)
    private String reference;

    /** Tally voucher type, e.g. "Receipt" — optional, only with a voucher number. */
    @Size(max = 50)
    private String tallyVoucherType;

    /** Tally voucher number — one credit note per Tally voucher. */
    @Size(max = 100)
    private String tallyVoucherNo;

    @Size(max = 1000)
    private String remarks;

    @Size(max = 255)
    private String attachmentName;

    /*
     * FC receipts: the amount in the donor's currency and the rate it was
     * converted at. All three or none; amount (INR) must equal
     * foreignAmount × fxRate (±₹1) — see CreditNoteService.
     */
    private String currency;
    private BigDecimal foreignAmount;
    private BigDecimal fxRate;

    @Size(max = 255)
    private String actor;
}
