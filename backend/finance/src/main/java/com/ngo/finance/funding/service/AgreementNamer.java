package com.ngo.finance.funding.service;

import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.GrantAgreement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The agreement's name is not typed in: it is built from the donor, what the
 * money is for, and the financial year it starts in — e.g.
 * "Tata Trusts · Clean Air Delhi · FY 2026-27". Once set it is kept, so a name
 * people already know an agreement by doesn't change when the terms are edited.
 */
@Component
public class AgreementNamer {

    /** grant_agreement.agreement_name is VARCHAR(255). */
    static final int MAX_LENGTH = 255;

    public String nameFor(GrantAgreement existing, DonorMaster donor, FundProfileResponse terms, LocalDate startDate) {
        if (existing != null && existing.getAgreementName() != null && !existing.getAgreementName().isBlank()) {
            return existing.getAgreementName();
        }
        List<String> parts = new ArrayList<>();
        addIfPresent(parts, donor != null ? donor.getDonorName() : terms.getDonorName());
        // What it funds: the programme / project, else the stated purpose.
        addIfPresent(parts, terms.getProgrammeName() != null ? terms.getProgrammeName() : terms.getPurpose());
        if (startDate != null) {
            parts.add(financialYear(startDate));
        }
        if (parts.size() < 2) {
            addIfPresent(parts, terms.getProfileCode());
        }
        String name = String.join(" · ", parts);
        return name.length() > MAX_LENGTH ? name.substring(0, MAX_LENGTH).trim() : name;
    }

    /** Indian financial year (April–March): 2026-05-10 → "FY 2026-27", 2027-02-01 → "FY 2026-27". */
    static String financialYear(LocalDate date) {
        int start = date.getMonthValue() >= 4 ? date.getYear() : date.getYear() - 1;
        return String.format("FY %d-%02d", start, (start + 1) % 100);
    }

    private static void addIfPresent(List<String> parts, String value) {
        if (value != null && !value.isBlank()) {
            parts.add(value.trim());
        }
    }
}
