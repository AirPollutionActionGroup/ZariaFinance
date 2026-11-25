package com.ngo.finance.funding.dto;

import com.ngo.finance.donor.dto.request.CreateFundProfileRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One funding record as the /funding form sends it: the donor, the terms (a
 * fund profile) and, optionally, the signed agreement on those terms. Saved
 * together in one transaction by FundingService.
 *
 * Field errors come back keyed by path — {@code terms.purpose},
 * {@code terms.disbursementRules.0.totalAmount}, {@code agreement.endDate}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FundingRequest {

    @NotNull(message = "Donor is required")
    private Long donorId;

    @NotNull(message = "Terms are required")
    @Valid
    private CreateFundProfileRequest terms;

    /** Null = terms only (no agreement signed yet). An existing agreement is never removed. */
    @Valid
    private AgreementPart agreement;

    /** Who is saving (shown in the change history). */
    @jakarta.validation.constraints.Size(max = 255)
    private String actor;

    /** Optional reason for this change, stored with its change-history entry. */
    @jakarta.validation.constraints.Size(max = 1000, message = "Keep the reason under 1000 characters")
    private String changeNote;

    /**
     * The agreement fields the user fills in. Its name, code, total, donor,
     * status and approval are all set by the server.
     */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AgreementPart {

        @NotNull(message = "Agreement date is required")
        private LocalDate agreementDate;

        @NotNull(message = "Start date is required")
        private LocalDate startDate;

        @NotNull(message = "End date is required")
        private LocalDate endDate;

        private String description;

        /** File name of the signed agreement. Required unless the agreement already has one. */
        private String agreementDocumentPath;
    }
}
