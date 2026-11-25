package com.ngo.finance.donor.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Donors from a CSV file, already split into rows by the browser. Values stay
 * text so each one can be checked and reported against its row; masters
 * (donor type, ID type, country, state, city) are matched by name.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DonorImportRequest {

    /** true: check every row and report, save nothing. false: save the selected rows. */
    private boolean dryRun;

    private String actor;

    /** Row numbers to import (dryRun false). Null means every row without an error that isn't a possible duplicate. */
    private List<Integer> selected;

    @NotNull(message = "No rows to import")
    @Size(min = 1, max = 500, message = "A file can have 1 to 500 rows")
    @Valid
    @Builder.Default
    private List<Row> rows = new ArrayList<>();

    /** One CSV row, as text. Column names follow the template. */
    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Row {
        private int rowNumber;
        private String donorCode;
        private String donorName;
        private String donorType;
        private String fundSourceDomicile;
        private String idType;
        private String idNumber;
        private String email;
        private String phone;
        private String website;
        private String contactName;
        private String contactEmail;
        private String contactPhone;
        private String address;
        private String address2;
        private String country;
        private String state;
        private String city;
        private String postalCode;
        private String registrationNumber;
        private String foreignFundSourceType;
        private String foreignCountry;
        private String passportId;
    }
}
