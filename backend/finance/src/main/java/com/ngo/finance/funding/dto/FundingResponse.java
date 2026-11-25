package com.ngo.finance.funding.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.dto.response.GrantDetailsResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** One funding record in full: its terms, its agreement (if signed) and its stage. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FundingResponse {

    /** The record's id is its fund profile's id — /funding/{id}. */
    private Long id;
    private FundingStage stage;
    private String stageLabel;
    private FundProfileResponse terms;
    /** Null until an agreement is recorded. */
    private GrantDetailsResponse agreement;

    public static FundingResponse of(FundProfileResponse terms, GrantDetailsResponse agreement) {
        FundingStage stage = FundingStage.of(agreement != null, agreement != null ? agreement.getIsApproved() : null);
        return FundingResponse.builder()
                .id(terms.getId())
                .stage(stage)
                .stageLabel(stage.getLabel())
                .terms(terms)
                .agreement(agreement)
                .build();
    }
}
