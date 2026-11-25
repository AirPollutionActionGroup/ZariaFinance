package com.ngo.finance.donor.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One point of contact on a donor create / update. {@code id} is set for a
 * contact that already exists (updated in place) and empty for a new one.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DonorContactItem {

    private Long id;

    @NotBlank(message = "Contact name is required")
    @Size(max = 255, message = "Contact name is too long")
    private String name;

    @NotBlank(message = "Contact email is required")
    @Email(message = "Contact email must be valid")
    @Size(max = 255, message = "Contact email is too long")
    private String email;

    @Size(max = 30, message = "Phone number is too long")
    private String phone;

    /** Exactly one contact per donor is primary; if none is marked, the first one is. */
    private Boolean isPrimary;
}
