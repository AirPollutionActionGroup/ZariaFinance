package com.ngo.finance.masters.documenttype.dto;

import com.ngo.finance.common.enums.FundSourceDomicile;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.Set;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Create / update a document type: its name, status, fund source domicile(s) and the donor types that need it. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentTypeRequest {

    @NotBlank(message = "Document type name is required")
    @Size(max = 255, message = "Name can be at most 255 characters")
    private String name;

    /** Defaults to active when omitted on create. */
    private Boolean status;


    /** Fund source domiciles the type is offered to — Domestic, Foreign or both. Required. */
    @NotEmpty(message = "Choose the fund source domicile — Domestic, Foreign or both")
    private Set<FundSourceDomicile> allowedFundSourceDomiciles;

    /** Donor types that must give this document; null/empty = required for none. On update, null leaves them unchanged. */
    private Set<Long> requiredForDonorTypeIds;
}
