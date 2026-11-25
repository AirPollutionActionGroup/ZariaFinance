package com.ngo.finance.donor.enums;

/**
 * Where the FX rate saved on a foreign-currency commitment came from. Mirrors
 * chk_disb_fc_values on donor_disbursement_rule.fx_rate_source.
 */
public enum FxRateSource {
    FBIL("RBI/FBIL reference rate"),
    ECB("ECB reference rate"),
    MANUAL("Entered manually");

    private final String label;

    FxRateSource(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
