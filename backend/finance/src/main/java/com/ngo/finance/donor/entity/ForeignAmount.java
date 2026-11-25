package com.ngo.finance.donor.entity;

import com.ngo.finance.donor.enums.FxRateSource;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Foreign contribution (FC book) on a disbursement rule: what the INR
 * total_amount was derived from (foreignAmount × fxRate) and where the rate came
 * from. Stored on donor_disbursement_rule itself, not in a table of its own.
 * All five columns are set together or all left NULL (chk_disb_fc_all_or_none);
 * when they are all NULL, Hibernate loads the embedded value as null.
 */
@Embeddable
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ForeignAmount {

    /** ISO 4217 code, e.g. USD. */
    @Column(name = "currency", length = 3)
    private String currency;

    @Column(name = "foreign_amount", precision = 19, scale = 2)
    private BigDecimal foreignAmount;

    /** ₹ per one unit of currency. */
    @Column(name = "fx_rate", precision = 19, scale = 4)
    private BigDecimal fxRate;

    /** The day the rate belongs to (may be before the date asked for). */
    @Column(name = "fx_rate_date")
    private LocalDate fxRateDate;

    @Column(name = "fx_rate_source", length = 20)
    @Enumerated(EnumType.STRING)
    private FxRateSource fxRateSource;
}
