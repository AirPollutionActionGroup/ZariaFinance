package com.ngo.finance.masters.overbudgetreason.dto;

import com.ngo.finance.masters.overbudgetreason.entity.OverBudgetReason;
import java.time.LocalDateTime;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** An over-budget reason as shown in Masters and on the debit note form. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OverBudgetReasonResponse {

    private Long id;
    private String name;
    private String description;
    /** ACTIVE | INACTIVE, as on the other masters. */
    private String status;
    /** Debit notes that give this reason. */
    private long usedCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static OverBudgetReasonResponse of(OverBudgetReason entity, long usedCount) {
        return OverBudgetReasonResponse.builder()
                .id(entity.getId())
                .name(entity.getName())
                .description(entity.getDescription())
                .status(Boolean.TRUE.equals(entity.getStatus()) ? "ACTIVE" : "INACTIVE")
                .usedCount(usedCount)
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
