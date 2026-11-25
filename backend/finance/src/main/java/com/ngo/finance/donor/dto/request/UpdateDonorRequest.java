package com.ngo.finance.donor.dto.request;

import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Request DTO for updating a Donor
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateDonorRequest {

    private String donorName;

    private Long donorTypeId;

    private FundSourceDomicile fundSourceDomicile;

    private Boolean fcraApplicable;

    private ContributionType book;

    private String foreignFundSourceType;

    private String foreignCountryId;

    private String passportId;

    /** Id of a Document Type master row (PAN Card, …); null leaves it unchanged. */
    private Long documentTypeId;

    private String documentNumber;

    @Email(message = "Email must be valid")
    private String email;

    private String phoneNumber;

    private String website;

    /**
     * Points of contact. Null leaves them as they are; a list replaces them —
     * items with an id are updated, new ones added, the rest removed.
     */
    @Size(min = 1, max = 10, message = "A donor needs 1 to 10 points of contact")
    @Valid
    private List<DonorContactItem> contacts;

    private String address;

    private String address2;

    private Long cityId;

    private Long stateId;

    private Long countryId;

    private String postalCode;

    private String registrationNumber;

    private Boolean isActive;
}
