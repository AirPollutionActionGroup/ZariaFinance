package com.ngo.finance.donor.dto.request;

import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.validator.annotation.UniqueDonorCode;
import jakarta.persistence.Column;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for creating a new Donor
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateDonorRequest {

    @NotBlank(message = "Donor code is required")
    @UniqueDonorCode
    private String donorCode;

    @NotBlank(message = "Donor name is required")
    private String donorName;

    /** Id of an active {@code DonorTypeMaster} row. */
    @NotNull(message = "Donor type is required")
    private Long donorTypeId;

    @NotNull(message = "Fund source domicile is required")
    @Enumerated(EnumType.STRING)
    private FundSourceDomicile fundSourceDomicile;

    @Builder.Default
    private Boolean fcraApplicable = false;

    @Enumerated(EnumType.STRING)
    private ContributionType book;

    private String foreignFundSourceType;

    private String foreignCountryId;

    private String passportId;

    /** Id of an active Document Type master row (PAN Card, …); null = no ID document. */
    private Long documentTypeId;

    private String documentNumber;

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    private String phoneNumber;

    private String website;

    /** Points of contact: 1 to 10, exactly one primary (the first, if none is marked). */
    @NotEmpty(message = "Add at least one point of contact")
    @Size(max = 10, message = "A donor can have up to 10 points of contact")
    @Valid
    private List<DonorContactItem> contacts;

    private String address;
    private String address2;

    private Long cityId;

    private Long stateId;

    private Long countryId;

    private String postalCode;

    private String registrationNumber; // Registration/Incorporation Number – The donor's registration or incorporation
                                       // number in its home country. This field is applicable only for organisations
                                       // (e.g., companies or foundations) and not for individual donors.
    @Builder.Default
    private Boolean isActive = true;

}
