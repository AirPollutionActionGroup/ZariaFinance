package com.ngo.finance.masters.overbudgetreason.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Create / update an over-budget reason. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class OverBudgetReasonRequest {

    @NotBlank(message = "Reason name is required")
    @Size(max = 255, message = "Name can be at most 255 characters")
    private String name;

    @Size(max = 500, message = "Description can be at most 500 characters")
    private String description;

    /** Defaults to active when omitted on create; on update, null leaves it unchanged. */
    private Boolean status;
}
