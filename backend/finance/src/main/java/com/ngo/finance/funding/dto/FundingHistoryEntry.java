package com.ngo.finance.funding.dto;

import java.time.LocalDateTime;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One entry of a funding record's change history: one save or one status step. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FundingHistoryEntry {

    private String id;
    /** CREATED | UPDATED | AGREEMENT_ADDED | APPROVED | ACTIVATED | ON_HOLD | RESUMED | COMPLETED | CLOSED */
    private String action;
    private String actionLabel;
    private LocalDateTime changedAt;
    private String changedBy;
    /** Reason for the change, or approval / hold remarks. */
    private String note;
    private List<FieldChange> changes;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FieldChange {
        private String section;
        private String field;
        private String from;
        private String to;
    }
}
