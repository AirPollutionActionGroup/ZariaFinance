package com.ngo.finance.funding.enums;

/** What a funding change-log entry records. */
public enum FundingChangeAction {
    CREATED("Created"),
    UPDATED("Edited"),
    AGREEMENT_ADDED("Agreement recorded"),
    APPROVED("Approved"),
    ACTIVATED("Activated"),
    ON_HOLD("Put on hold"),
    RESUMED("Resumed"),
    COMPLETED("Completed"),
    CLOSED("Closed");

    private final String label;

    FundingChangeAction(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
