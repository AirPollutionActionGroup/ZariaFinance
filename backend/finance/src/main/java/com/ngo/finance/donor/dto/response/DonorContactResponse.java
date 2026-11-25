package com.ngo.finance.donor.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A donor's point of contact. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DonorContactResponse {
    private Long id;
    private String name;
    private String email;
    private String phone;
    private Boolean isPrimary;
}
