package com.ngo.finance.donor.service.impl;

import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.donor.dto.request.CreateDonorRequest;
import com.ngo.finance.donor.dto.request.DonorContactItem;
import com.ngo.finance.donor.dto.request.DonorImportRequest;
import com.ngo.finance.donor.dto.request.DonorImportRequest.Row;
import com.ngo.finance.donor.dto.response.DonorImportResponse;
import com.ngo.finance.donor.dto.response.DonorImportResponse.RowResult;
import com.ngo.finance.donor.dto.response.DonorResponse;
import com.ngo.finance.donor.entity.CityMaster;
import com.ngo.finance.donor.entity.CountryMaster;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.entity.StateMaster;
import com.ngo.finance.donor.repository.CityRepository;
import com.ngo.finance.donor.repository.CountryRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.repository.StateRepository;
import com.ngo.finance.donor.service.DonorService;
import com.ngo.finance.masters.documenttype.entity.DocumentTypeMaster;
import com.ngo.finance.masters.documenttype.repository.DocumentTypeMasterRepository;
import com.ngo.finance.masters.donortype.entity.DonorTypeMaster;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import com.ngo.finance.transaction.dto.response.CreditNoteImportResponse.Status;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Donors from a CSV file. Every row is checked the way the New Donor form and
 * DonorService check it — donor type allows the domicile, the ID type fits
 * the domicile, a domestic donor has its ID document, a foreign individual its
 * passport, the primary contact has a name and a valid email, the state is in
 * the country and the city in the state — and reported per row. Valid rows are
 * saved through DonorService, in one transaction, Inactive (unlike a donor created on the form, which starts Active).
 *
 * An ID number already on a donor (or twice in the file) is an error; the same
 * donor name is a possible duplicate, saved only when the user ticks it. A
 * blank donor_code gets the next DNR-CD-nnn, skipping codes used anywhere.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DonorImportService {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final String CODE_PREFIX = "DNR-CD-";

    private final DonorService donorService;
    private final DonorRepository donorRepository;
    private final DonorTypeMasterRepository donorTypeRepository;
    private final DocumentTypeMasterRepository documentTypeRepository;
    private final com.ngo.finance.masters.documenttype.service.DocumentTypeService documentTypeService;
    private final CountryRepository countryRepository;
    private final StateRepository stateRepository;
    private final CityRepository cityRepository;

    /** Masters and existing donors, read once per import. */
    private final class Context {
        final List<DonorTypeMaster> donorTypes = donorTypeRepository.findAll();
        final List<DocumentTypeMaster> documentTypes = documentTypeRepository.findAllByOrderByNameAsc();
        final List<CountryMaster> countries = countryRepository.findAll().stream()
                .filter(c -> !Boolean.FALSE.equals(c.getIsActive())).toList();
        final Map<Long, List<StateMaster>> statesByCountry = new HashMap<>();
        final Map<Long, List<CityMaster>> citiesByState = new HashMap<>();
        final Set<String> existingNames = new HashSet<>();
        /** "TYPE|NUMBER" → donor code, for ID documents already on a donor. */
        final Map<String, String> existingIds = new HashMap<>();
        final Set<String> existingCodes = new HashSet<>();

        Context() {
            for (DonorMaster d : donorRepository.findAll()) {
                existingNames.add(norm(d.getDonorName()));
                existingCodes.add(d.getDonorCode().toUpperCase(Locale.ROOT));
                if (!blank(d.getDocumentNumber())) {
                    existingIds.put(idKey(d.getDocumentTypeId(), d.getDocumentNumber()), d.getDonorCode());
                }
            }
        }

        List<StateMaster> states(Long countryId) {
            return statesByCountry.computeIfAbsent(countryId, id -> stateRepository.findByCountryIdAndIsActive(id, true));
        }

        List<CityMaster> cities(Long stateId) {
            return citiesByState.computeIfAbsent(stateId, cityRepository::findActiveCitiesByStateId);
        }
    }

    private record Checked(RowResult result, CreateDonorRequest request) {
    }

    @Transactional
    public DonorImportResponse importDonors(DonorImportRequest request) {
        Context ctx = new Context();
        Set<Integer> selected = request.isDryRun() || request.getSelected() == null ? null : new HashSet<>(request.getSelected());

        // Codes given in the file are reserved first, so a blank row never takes one of them.
        Set<String> usedCodes = new HashSet<>(ctx.existingCodes);
        Map<String, Integer> givenCodes = new HashMap<>();
        for (Row row : request.getRows()) {
            if (!blank(row.getDonorCode())) {
                givenCodes.putIfAbsent(row.getDonorCode().trim().toUpperCase(Locale.ROOT), row.getRowNumber());
            }
        }
        usedCodes.addAll(givenCodes.keySet());
        int[] nextNumber = {firstFreeNumber(donorService.nextDonorCode())};

        List<Checked> checked = new ArrayList<>();
        Set<String> namesInFile = new HashSet<>();
        Map<String, Integer> idsInFile = new HashMap<>();
        for (Row row : request.getRows()) {
            RowResult r = RowResult.builder().rowNumber(row.getRowNumber()).build();

            // Donor code: given (must be new and once in the file), or the next free one.
            String code;
            if (!blank(row.getDonorCode())) {
                code = row.getDonorCode().trim();
                String key = code.toUpperCase(Locale.ROOT);
                if (code.length() > 20) {
                    r.getErrors().add("donor_code is longer than 20 characters");
                } else if (ctx.existingCodes.contains(key)) {
                    r.getErrors().add("donor_code " + code + " is already used by another donor");
                } else if (!Objects.equals(givenCodes.get(key), row.getRowNumber())) {
                    r.getErrors().add("donor_code " + code + " is also on row " + givenCodes.get(key) + " of this file");
                }
            } else {
                code = null; // given out below, only to rows that are saved (or would be)
            }
            r.setDonorCode(code);

            CreateDonorRequest donor = check(row, code, r, ctx);

            // The same ID document already on a donor, or earlier in this file → error.
            if (donor != null && !blank(donor.getDocumentNumber())) {
                String key = idKey(donor.getDocumentTypeId(), donor.getDocumentNumber());
                Integer earlier = idsInFile.putIfAbsent(key, row.getRowNumber());
                if (ctx.existingIds.containsKey(key)) {
                    r.getErrors().add(r.getIdDocument() + " is already on donor " + ctx.existingIds.get(key));
                } else if (earlier != null) {
                    r.getErrors().add(r.getIdDocument() + " is also on row " + earlier + " of this file");
                }
            }
            // The same name → a possible duplicate.
            if (r.getErrors().isEmpty() && donor != null) {
                String name = norm(donor.getDonorName());
                boolean inFile = !namesInFile.add(name);
                if (ctx.existingNames.contains(name) || inFile) {
                    r.setDuplicate(true);
                    r.getWarnings().add(ctx.existingNames.contains(name)
                            ? "Possible duplicate: a donor named " + donor.getDonorName() + " already exists"
                            : "Possible duplicate: an earlier row in this file has the same donor name");
                }
            }
            r.setStatus(!r.getErrors().isEmpty() ? Status.ERROR : !r.getWarnings().isEmpty() ? Status.WARNING : Status.READY);
            checked.add(new Checked(r, r.getErrors().isEmpty() ? donor : null));
        }

        // Blank codes: the next free DNR-CD-nnn, in file order, only for rows that are saved
        // (dry run: every row without an error), so rows left out don't leave gaps.
        for (Checked c : checked) {
            RowResult r = c.result();
            boolean takes = r.getStatus() != Status.ERROR
                    && (selected == null || selected.contains(r.getRowNumber()))
                    && (request.isDryRun() || selected != null || !r.isDuplicate());
            if (r.getDonorCode() == null && takes) {
                String candidate;
                do {
                    candidate = CODE_PREFIX + String.format("%03d", nextNumber[0]++);
                } while (usedCodes.contains(candidate));
                usedCodes.add(candidate);
                r.setDonorCode(candidate);
                c.request().setDonorCode(candidate);
            }
        }

        int created = 0;
        if (!request.isDryRun()) {
            for (Checked c : checked) {
                RowResult r = c.result();
                if (r.getStatus() == Status.ERROR) {
                    continue;
                }
                boolean wanted = selected != null ? selected.contains(r.getRowNumber()) : !r.isDuplicate();
                if (!wanted) {
                    r.setStatus(Status.SKIPPED);
                    continue;
                }
                DonorResponse saved = donorService.createDonor(c.request());
                r.setDonorId(saved.getId());
                r.setDonorCode(saved.getDonorCode());
                r.setStatus(Status.IMPORTED);
                created++;
            }
            log.info("Donor import: {} of {} rows imported", created, checked.size());
        }

        return DonorImportResponse.builder()
                .dryRun(request.isDryRun())
                .createdCount(created)
                .rows(checked.stream().map(Checked::result).toList())
                .build();
    }

    // ── One row ───────────────────────────────────────────────────────────────

    private CreateDonorRequest check(Row row, String code, RowResult r, Context ctx) {
        List<String> errors = r.getErrors();

        String name = trim(row.getDonorName());
        if (name == null) {
            errors.add("donor_name is required");
        } else if (name.length() > 255) {
            errors.add("donor_name is longer than 255 characters");
        }
        r.setDonorName(name);

        // Domicile → book and FCRA, as on the form.
        FundSourceDomicile domicile = null;
        if (blank(row.getFundSourceDomicile())) {
            errors.add("fund_source_domicile is required (Domestic or Foreign)");
        } else {
            String d = row.getFundSourceDomicile().trim().toUpperCase(Locale.ROOT);
            if (d.equals("DOMESTIC") || d.equals("FOREIGN")) {
                domicile = FundSourceDomicile.valueOf(d);
                r.setDomicile(domicile.getLabel());
                r.setBook(domicile == FundSourceDomicile.FOREIGN ? "FC" : "LC");
            } else {
                errors.add("fund_source_domicile \"" + row.getFundSourceDomicile().trim() + "\" must be Domestic or Foreign");
            }
        }
        ContributionType book = domicile == null ? null : domicile == FundSourceDomicile.FOREIGN ? ContributionType.FC : ContributionType.LC;

        // Donor type: active, and allows the domicile.
        DonorTypeMaster type = null;
        if (blank(row.getDonorType())) {
            errors.add("donor_type is required (" + String.join(", ", activeNames(ctx.donorTypes)) + ")");
        } else {
            type = ctx.donorTypes.stream().filter(t -> t.getName().equalsIgnoreCase(row.getDonorType().trim())).findFirst().orElse(null);
            if (type == null || !Boolean.TRUE.equals(type.getStatus())) {
                errors.add("donor_type \"" + row.getDonorType().trim() + "\" is not an active donor type ("
                        + String.join(", ", activeNames(ctx.donorTypes)) + ")");
                type = null;
            } else {
                r.setDonorType(type.getName());
                if (domicile != null && !type.getAllowedFundSourceDomiciles().isEmpty()
                        && !type.getAllowedFundSourceDomiciles().contains(domicile)) {
                    errors.add(type.getName() + " donors can't be " + domicile.getLabel().toLowerCase(Locale.ROOT));
                }
            }
        }

        // ID document: required for a domestic donor; the type must be offered to the domicile.
        DocumentTypeMaster idType = null;
        String idNumber = trim(row.getIdNumber());
        if (!blank(row.getIdType())) {
            String raw = row.getIdType().trim();
            idType = ctx.documentTypes.stream()
                    // By name, ignoring case, spaces and underscores — so "PAN Card", "pan card" and "PAN_CARD" all match.
                    .filter(t -> letters(t.getName()).equals(letters(raw)))
                    .findFirst().orElse(null);
            if (idType == null || !Boolean.TRUE.equals(idType.getStatus())) {
                errors.add("id_type \"" + raw + "\" is not an active ID type");
                idType = null;
            } else if (domicile != null && !idType.appliesTo(domicile)) {
                errors.add(idType.getName() + " is not used for " + domicile.getLabel().toLowerCase(Locale.ROOT) + " donors");
            }
        }
        if (domicile == FundSourceDomicile.DOMESTIC) {
            if (blank(row.getIdType())) {
                errors.add("id_type is required for a domestic donor, e.g. PAN Card");
            }
            if (idNumber == null) {
                errors.add("id_number is required for a domestic donor");
            }
        }
        if (domicile != FundSourceDomicile.DOMESTIC) {
            if (idNumber != null && blank(row.getIdType())) {
                errors.add("id_type is required with id_number");
            } else if (idNumber == null && !blank(row.getIdType())) {
                errors.add("id_number is required with id_type");
            }
        }
        if (idType != null && idNumber != null) {
            idNumber = idNumber.toUpperCase(Locale.ROOT);
            r.setIdDocument(idType.getName() + " " + idNumber);
        }
        // The donor type's required documents (Masters → Document types → "Required for"),
        // checked here so a dry run shows it on the row rather than failing the save.
        if (type != null) {
            try {
                documentTypeService.requireForDonorType(type.getId(), type.getName(), idType == null ? null : idType.getId(), domicile);
            } catch (ValidationException e) {
                errors.add(e.getMessage());
            }
        }

        // Foreign details.
        String foreignCountry = null;
        String passport = trim(row.getPassportId());
        if (domicile == FundSourceDomicile.FOREIGN) {
            if (!blank(row.getForeignCountry())) {
                CountryMaster c = matchCountry(row.getForeignCountry(), ctx);
                if (c == null) {
                    errors.add("foreign_country \"" + row.getForeignCountry().trim() + "\" is not a country");
                } else if (c.getCountryName().equalsIgnoreCase("India")) {
                    errors.add("foreign_country can't be India");
                } else {
                    foreignCountry = c.getCountryName();
                }
            }
            if (type != null && type.getName().equalsIgnoreCase("Individual") && passport == null) {
                errors.add("passport_id is required for a foreign individual");
            }
            if (passport != null && passport.length() > 9) {
                errors.add("passport_id must be at most 9 characters");
            }
        } else if (!blank(row.getForeignCountry()) || !blank(row.getForeignFundSourceType()) || passport != null) {
            errors.add("foreign_country / foreign_fund_source_type / passport_id are only for foreign donors");
        }

        // Donor email and phone, the primary contact.
        String email = trim(row.getEmail());
        if (email == null) {
            errors.add("email is required");
        } else if (!EMAIL.matcher(email).matches()) {
            errors.add("email \"" + email + "\" isn't a valid email");
        }
        String contactName = trim(row.getContactName());
        String contactEmail = trim(row.getContactEmail());
        String contactPhone = trim(row.getContactPhone());
        if (contactName == null) {
            errors.add("contact_name is required — the donor's point of contact");
        }
        if (contactEmail == null) {
            errors.add("contact_email is required");
        } else if (!EMAIL.matcher(contactEmail).matches()) {
            errors.add("contact_email \"" + contactEmail + "\" isn't a valid email");
        }
        r.setContactName(contactName);
        r.setContactEmail(contactEmail);
        maxLength("phone", row.getPhone(), 20, errors);
        maxLength("contact_phone", contactPhone, 30, errors);
        maxLength("postal_code", row.getPostalCode(), 20, errors);
        maxLength("registration_number", row.getRegistrationNumber(), 100, errors);
        maxLength("website", row.getWebsite(), 255, errors);

        // Address: street required; state within the country, city within the state.
        if (blank(row.getAddress())) {
            errors.add("address is required");
        }
        CountryMaster country = null;
        StateMaster state = null;
        CityMaster city = null;
        if (!blank(row.getCountry())) {
            country = matchCountry(row.getCountry(), ctx);
            if (country == null) {
                errors.add("country \"" + row.getCountry().trim() + "\" is not a country");
            }
        }
        if (!blank(row.getState())) {
            if (country == null && blank(row.getCountry())) {
                country = ctx.countries.stream().filter(c -> c.getCountryName().equalsIgnoreCase("India")).findFirst().orElse(null);
            }
            if (country != null) {
                String s = row.getState().trim();
                state = ctx.states(country.getId()).stream()
                        .filter(x -> x.getStateName().equalsIgnoreCase(s) || s.equalsIgnoreCase(x.getStateCode()))
                        .findFirst().orElse(null);
                if (state == null) {
                    errors.add("state \"" + s + "\" is not a state of " + country.getCountryName());
                }
            }
        }
        if (!blank(row.getCity())) {
            if (blank(row.getState())) {
                errors.add("city needs its state");
            } else if (state != null) {
                String cityName = row.getCity().trim();
                StateMaster st = state;
                city = ctx.cities(state.getId()).stream()
                        .filter(x -> x.getCityName().equalsIgnoreCase(cityName))
                        .findFirst().orElse(null);
                if (city == null) {
                    errors.add("city \"" + cityName + "\" is not a city of " + st.getStateName());
                }
            }
        }

        if (!errors.isEmpty()) {
            return null;
        }
        return CreateDonorRequest.builder()
                .isActive(false) // imported donors start Inactive until someone reviews them
                .donorCode(code)
                .donorName(name)
                .donorTypeId(type.getId())
                .fundSourceDomicile(domicile)
                .fcraApplicable(domicile == FundSourceDomicile.FOREIGN)
                .book(book)
                .foreignFundSourceType(domicile == FundSourceDomicile.FOREIGN ? trim(row.getForeignFundSourceType()) : null)
                .foreignCountryId(foreignCountry)
                .passportId(passport == null ? null : passport.toUpperCase(Locale.ROOT))
                .documentTypeId(idType == null ? null : idType.getId())
                .documentNumber(idType == null ? null : idNumber)
                .email(email)
                .phoneNumber(trim(row.getPhone()))
                .website(trim(row.getWebsite()))
                .contacts(List.of(DonorContactItem.builder()
                        .name(contactName).email(contactEmail).phone(contactPhone).isPrimary(true).build()))
                .address(trim(row.getAddress()))
                .address2(trim(row.getAddress2()))
                .countryId(country == null ? null : country.getId())
                .stateId(state == null ? null : state.getId())
                .cityId(city == null ? null : city.getId())
                .postalCode(trim(row.getPostalCode()))
                .registrationNumber(trim(row.getRegistrationNumber()))
                .build();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static CountryMaster matchCountry(String raw, Context ctx) {
        String s = raw.trim();
        return ctx.countries.stream()
                .filter(c -> c.getCountryName().equalsIgnoreCase(s) || s.equalsIgnoreCase(c.getCountryCode()))
                .findFirst().orElse(null);
    }

    private static List<String> activeNames(List<DonorTypeMaster> types) {
        return types.stream().filter(t -> Boolean.TRUE.equals(t.getStatus())).map(DonorTypeMaster::getName).toList();
    }

    /** "DNR-CD-016" → 16; anything else → 1. */
    private static int firstFreeNumber(String nextCode) {
        String n = nextCode.startsWith(CODE_PREFIX) ? nextCode.substring(CODE_PREFIX.length()) : "";
        return n.matches("\\d+") ? Integer.parseInt(n) : 1;
    }

    private static void maxLength(String column, String value, int max, List<String> errors) {
        if (value != null && value.trim().length() > max) {
            errors.add(column + " is longer than " + max + " characters");
        }
    }

    /** Lower-case letters and digits only: "PAN_CARD" and "PAN Card" → "pancard". */
    private static String letters(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static String idKey(Long type, String number) {
        return (type == null ? "" : String.valueOf(type)) + "|" + number.trim().toUpperCase(Locale.ROOT);
    }

    private static String trim(String s) {
        return blank(s) ? null : s.trim();
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
