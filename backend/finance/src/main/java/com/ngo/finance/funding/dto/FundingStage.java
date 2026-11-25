package com.ngo.finance.funding.dto;

/**
 * Where a funding record is in its life. TERMS = fund profile only; the rest
 * follow the agreement's approval state (grant_agreement.is_approved).
 */
public enum FundingStage {
    TERMS("Terms only"),
    PENDING("Pending approval"),
    APPROVED("Approved"),
    ON_HOLD("On hold"),
    COMPLETED("Completed");

    private final String label;

    FundingStage(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** No agreement → TERMS; is_approved 1/2/3/4 → APPROVED/PENDING/ON_HOLD/COMPLETED (unknown → PENDING). */
    public static FundingStage of(boolean hasAgreement, Integer isApproved) {
        if (!hasAgreement) {
            return TERMS;
        }
        if (isApproved == null) {
            return PENDING;
        }
        return switch (isApproved) {
            case 1 -> APPROVED;
            case 3 -> ON_HOLD;
            case 4 -> COMPLETED;
            default -> PENDING;
        };
    }
}
