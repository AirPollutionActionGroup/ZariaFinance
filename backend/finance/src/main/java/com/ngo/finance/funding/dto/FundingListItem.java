package com.ngo.finance.funding.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One row of the /funding list. Usually a fund profile and its agreement; an
 * older agreement with no fund profile appears on its own (profileId null).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class FundingListItem {

    private Long profileId;
    private Long grantId;
    private String profileCode;
    private String grantCode;
    /** The agreement's number before the GA-{FY}-{nnn} format, if any — so old numbers still search. */
    private String legacyCode;
    private Long donorId;
    private String donorName;
    /** Agreement name, else the terms' purpose. */
    private String title;
    private String programmeName;
    /** CLASS_A_RESTRICTED / … */
    private String fundClass;
    private String fundClassLabel;
    /** INR committed: the agreement's total, else the terms' disbursement total. */
    private BigDecimal committed;
    /** FC book only. */
    private String currency;
    private BigDecimal foreignAmount;
    /** False for terms with no disbursement schedule yet. */
    private Boolean hasSchedule;
    private LocalDate startDate;
    private LocalDate endDate;
    private FundingStage stage;
    private String stageLabel;
    /** The agreement's own status (ACTIVE / COMPLETED / CANCELLED) and its active flag — null for terms only. */
    private String agreementStatus;
    private Boolean active;
}
