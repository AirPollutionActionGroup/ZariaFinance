package com.ngo.finance.donor.service.impl;

import com.ngo.finance.common.enums.ContributionType;
import com.ngo.finance.common.enums.FundSourceDomicile;
import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.donor.dto.request.CreateDonorRequest;
import com.ngo.finance.donor.dto.request.UpdateDonorRequest;
import com.ngo.finance.donor.dto.response.DonorResponse;
import com.ngo.finance.donor.entity.CountryMaster;
import com.ngo.finance.donor.entity.DonorMaster;
import com.ngo.finance.donor.mapper.DonorMapper;
import com.ngo.finance.donor.repository.CityRepository;
import com.ngo.finance.donor.repository.DonorContactRepository;
import com.ngo.finance.donor.repository.DonorRepository;
import com.ngo.finance.donor.repository.StateRepository;
import com.ngo.finance.donor.service.DonorService;
import com.ngo.finance.masters.documenttype.service.DocumentTypeService;
import com.ngo.finance.masters.donortype.entity.DonorTypeMaster;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import com.ngo.finance.donor.dto.request.DonorContactItem;
import com.ngo.finance.donor.entity.DonorContact;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.ngo.finance.donor.repository.CountryRepository;

/**
 * Service implementation for Donor operations
 */
@Slf4j
@Service
@Transactional
public class DonorServiceImpl implements DonorService {

    @Autowired
    private DonorRepository donorRepository;

    @Autowired
    private DonorContactRepository donorContactRepository;

    @Autowired
    private CountryRepository countryRepository;

    @Autowired
    private StateRepository stateRepository;

    @Autowired
    private CityRepository cityRepository;

    @Autowired
    private DonorMapper donorMapper;

    @Autowired
    private DonorTypeMasterRepository donorTypeMasterRepository;

    @Autowired
    private DocumentTypeService documentTypeService;

    /**
     * Resolves the donor type by id, requires it to be active, and — when the
     * donor type restricts Fund Source Domicile / Contribution Type — checks
     * the request's chosen values are among the allowed ones.
     */
    private DonorTypeMaster resolveDonorType(Long donorTypeId, FundSourceDomicile fundSourceDomicile,
            ContributionType book) {
        DonorTypeMaster donorType = donorTypeMasterRepository.findById(donorTypeId)
                .orElseThrow(() -> new ResourceNotFoundException("Donor type", donorTypeId));
        if (!Boolean.TRUE.equals(donorType.getStatus())) {
            throw new ValidationException("Donor type '" + donorType.getName() + "' is not active");
        }
        if (fundSourceDomicile != null
                && !donorType.getAllowedFundSourceDomiciles().isEmpty()
                && !donorType.getAllowedFundSourceDomiciles().contains(fundSourceDomicile)) {
            throw new ValidationException("Fund source domicile '" + fundSourceDomicile
                    + "' is not allowed for donor type '" + donorType.getName() + "'");
        }
        if (book != null
                && !donorType.getAllowedContributionTypes().isEmpty()
                && !donorType.getAllowedContributionTypes().contains(book)) {
            throw new ValidationException("Contribution type '" + book
                    + "' is not allowed for donor type '" + donorType.getName() + "'");
        }
        return donorType;
    }

    @Override
    public DonorResponse createDonor(CreateDonorRequest request) {
        log.info("Creating new donor with code: {}", request.getDonorCode());

        DonorTypeMaster donorType = resolveDonorType(request.getDonorTypeId(), request.getFundSourceDomicile(),
                request.getBook());

        DonorMaster donor = donorMapper.toEntity(request);
        donor.setDonorType(donorType);
        donor.setDocumentTypeId(documentTypeService.requireUsable(
                request.getDocumentTypeId(), null, request.getFundSourceDomicile()));
        documentTypeService.requireForDonorType(donorType != null ? donorType.getId() : null,
                donorType != null ? donorType.getName() : null, donor.getDocumentTypeId(), request.getFundSourceDomicile());

        if (request.getCountryId() != null) {
            donor.setCountry(countryRepository.findById(request.getCountryId())
                    .orElseThrow(() -> new ResourceNotFoundException("Country", request.getCountryId())));
        }

        if (request.getStateId() != null) {
            donor.setState(stateRepository.findById(request.getStateId())
                    .orElseThrow(() -> new ResourceNotFoundException("State", request.getStateId())));
        }

        if (request.getCityId() != null) {
            donor.setCity(cityRepository.findById(request.getCityId())
                    .orElseThrow(() -> new ResourceNotFoundException("City", request.getCityId())));
        }

        // A donor created on the form starts Active (the request defaults to it); the CSV
        // import asks for Inactive explicitly, so imported donors are reviewed first.
        donor.setIsActive(!Boolean.FALSE.equals(request.getIsActive()));
        applyContacts(donor, request.getContacts());

        DonorMaster savedDonor = donorRepository.save(donor);
        log.info("Donor created successfully with id: {}", savedDonor.getId());

        return donorMapper.toResponse(savedDonor);
    }

    private static final String DONOR_CODE_PREFIX = "DNR-CD-";

    /** DNR-CD-{nnn}: one more than the highest existing number, starting at 001. */
    @Override
    @Transactional(readOnly = true)
    public String nextDonorCode() {
        int next = donorRepository.findTopByDonorCodeStartingWithOrderByDonorCodeDesc(DONOR_CODE_PREFIX)
                .map(d -> d.getDonorCode().substring(DONOR_CODE_PREFIX.length()))
                .filter(n -> n.matches("\\d+"))
                .map(n -> Integer.parseInt(n) + 1)
                .orElse(1);
        String code = DONOR_CODE_PREFIX + String.format("%03d", next);
        while (donorRepository.findByDonorCode(code).isPresent()) {
            code = DONOR_CODE_PREFIX + String.format("%03d", ++next);
        }
        return code;
    }

    @Override
    @Transactional(readOnly = true)
    public DonorResponse getDonorById(Long id) {
        log.debug("Fetching donor with id: {}", id);
        DonorMaster donor = donorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Donor", id));
        return donorMapper.toResponse(donor);
    }

    @Override
    @Transactional(readOnly = true)
    public DonorResponse getDonorByCode(String donorCode) {
        log.debug("Fetching donor with code: {}", donorCode);
        DonorMaster donor = donorRepository.findByDonorCode(donorCode)
                .orElseThrow(() -> new ResourceNotFoundException("Donor", "code", donorCode));
        return donorMapper.toResponse(donor);
    }

    @Override
    @Transactional(readOnly = true)
    public List<DonorResponse> getAllDonors() {
        log.debug("Fetching all donors");
        return donorRepository.findAll().stream()
                .map(donorMapper::toResponse)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public List<DonorResponse> searchDonors(String searchTerm) {
        log.debug("Searching donors with term: {}", searchTerm);
        return donorRepository.searchByCodeOrName(searchTerm).stream()
                .map(donorMapper::toResponse)
                .toList();
    }

    @Override
    public DonorResponse updateDonor(Long id, UpdateDonorRequest request) {
        log.info("Updating donor with id: {}", id);

        DonorMaster donor = donorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Donor", id));

        // For the required-document check below: only re-checked when the donor type or the document changes.
        Long donorTypeBefore = donor.getDonorType() != null ? donor.getDonorType().getId() : null;
        Long documentBefore = donor.getDocumentTypeId();

        if (request.getDonorTypeId() != null) {
            FundSourceDomicile effectiveDomicile = request.getFundSourceDomicile() != null
                    ? request.getFundSourceDomicile()
                    : donor.getFundSourceDomicile();
            ContributionType effectiveBook = request.getBook() != null ? request.getBook() : donor.getBook();
            donor.setDonorType(resolveDonorType(request.getDonorTypeId(), effectiveDomicile, effectiveBook));
        }

        if (request.getCountryId() != null) {
            donor.setCountry(countryRepository.findById(request.getCountryId())
                    .orElseThrow(() -> new ResourceNotFoundException("Country", request.getCountryId())));
        }

        if (request.getStateId() != null) {
            donor.setState(stateRepository.findById(request.getStateId())
                    .orElseThrow(() -> new ResourceNotFoundException("State", request.getStateId())));
        }

        if (request.getCityId() != null) {
            donor.setCity(cityRepository.findById(request.getCityId())
                    .orElseThrow(() -> new ResourceNotFoundException("City", request.getCityId())));
        }

        FundSourceDomicile effectiveDomicileForDocument = request.getFundSourceDomicile() != null
                ? request.getFundSourceDomicile()
                : donor.getFundSourceDomicile();
        boolean domicileChanged = effectiveDomicileForDocument != donor.getFundSourceDomicile();

        donorMapper.updateEntity(CreateDonorRequest.builder()
                .donorCode(donor.getDonorCode())
                .donorName(request.getDonorName())
                .fundSourceDomicile(request.getFundSourceDomicile())
                .fcraApplicable(request.getFcraApplicable())
                .book(request.getBook())
                .foreignFundSourceType(request.getForeignFundSourceType())
                .foreignCountryId(request.getForeignCountryId())
                .passportId(request.getPassportId())
                .documentTypeId(request.getDocumentTypeId() == null
                        ? null
                        : documentTypeService.requireUsable(
                                request.getDocumentTypeId(),
                                // Keeping the saved type is fine, unless the domicile changes —
                                // then the type must fit the new domicile like a fresh choice.
                                domicileChanged ? null : donor.getDocumentTypeId(),
                                effectiveDomicileForDocument))
                .documentNumber(request.getDocumentNumber())
                .email(request.getEmail())
                .phoneNumber(request.getPhoneNumber())
                .website(request.getWebsite())
                .address(request.getAddress())
                .address2(request.getAddress2())
                .cityId(request.getCityId())
                .stateId(request.getStateId())
                .countryId(request.getCountryId())
                .postalCode(request.getPostalCode())
                .registrationNumber(request.getRegistrationNumber())
                .isActive(request.getIsActive())
                .build(), donor);
        if (request.getContacts() != null) {
            applyContacts(donor, request.getContacts());
        }

        Long donorTypeAfter = donor.getDonorType() != null ? donor.getDonorType().getId() : null;
        if (!java.util.Objects.equals(donorTypeBefore, donorTypeAfter)
                || !java.util.Objects.equals(documentBefore, donor.getDocumentTypeId())) {
            documentTypeService.requireForDonorType(donorTypeAfter,
                    donor.getDonorType() != null ? donor.getDonorType().getName() : null,
                    donor.getDocumentTypeId(), donor.getFundSourceDomicile());
        }

        DonorMaster updated = donorRepository.save(donor);
        log.info("Donor updated successfully");

        return donorMapper.toResponse(updated);
    }

    /**
     * Sets the donor's points of contact to {@code items}: an item with an id
     * updates that contact, one without adds a new contact, and contacts left
     * out are removed. Exactly one is primary (the first, if none is marked);
     * an email appears once per donor. Errors name the item, e.g.
     * {@code contacts.1.email}, so the form can show them on the right field.
     */
    private void applyContacts(DonorMaster donor, List<DonorContactItem> items) {
        Map<String, String> errors = new LinkedHashMap<>();
        if (items == null || items.isEmpty()) {
            throw new ValidationException("Add at least one point of contact", Map.of("contacts", "Add at least one point of contact"));
        }
        long primaries = items.stream().filter(i -> Boolean.TRUE.equals(i.getIsPrimary())).count();
        if (primaries > 1) {
            errors.put("contacts", "Only one point of contact can be primary");
        }
        Map<String, Integer> seenEmails = new HashMap<>();
        for (int i = 0; i < items.size(); i++) {
            String email = items.get(i).getEmail() == null ? "" : items.get(i).getEmail().trim().toLowerCase(Locale.ROOT);
            Integer earlier = seenEmails.putIfAbsent(email, i);
            if (earlier != null && !email.isEmpty()) {
                errors.put("contacts." + i + ".email", "This email is already on contact " + (earlier + 1));
            }
        }
        Map<Long, DonorContact> existing = new HashMap<>();
        donor.getContacts().forEach(c -> existing.put(c.getId(), c));
        for (int i = 0; i < items.size(); i++) {
            Long id = items.get(i).getId();
            if (id != null && !existing.containsKey(id)) {
                errors.put("contacts." + i, "This contact doesn't belong to the donor");
            }
        }
        if (!errors.isEmpty()) {
            throw new ValidationException("Validation failed for one or more fields", errors);
        }

        int primaryIndex = 0;
        for (int i = 0; i < items.size(); i++) {
            if (Boolean.TRUE.equals(items.get(i).getIsPrimary())) {
                primaryIndex = i;
            }
        }

        // Step 1 (existing donor): drop removed contacts and park the kept ones
        // (not primary, a placeholder email), then flush. Inserts are flushed
        // before deletes, so without this a new primary, or an email moved
        // from a removed / another contact, would hit the unique indexes.
        Set<DonorContact> kept = Collections.newSetFromMap(new IdentityHashMap<>());
        items.stream().map(DonorContactItem::getId).filter(Objects::nonNull).map(existing::get).forEach(kept::add);
        if (!existing.isEmpty()) {
            // Deleted explicitly (not left to orphan removal), so the delete is
            // in this flush even if the contacts were added earlier in the same transaction.
            List<DonorContact> removed = donor.getContacts().stream().filter(c -> !kept.contains(c)).toList();
            donor.getContacts().removeAll(removed);
            donorContactRepository.deleteAll(removed);
            for (DonorContact c : kept) {
                c.setIsPrimary(false);
                c.setEmail("~" + c.getId() + "@pending.invalid");
            }
            donorRepository.saveAndFlush(donor);
        }

        // Step 2: the final values, in the order given.
        for (int i = 0; i < items.size(); i++) {
            DonorContactItem item = items.get(i);
            DonorContact contact = item.getId() != null ? existing.get(item.getId()) : DonorContact.builder().donor(donor).build();
            contact.setName(item.getName().trim());
            contact.setEmail(item.getEmail().trim());
            contact.setPhone(item.getPhone() == null || item.getPhone().isBlank() ? null : item.getPhone().trim());
            contact.setIsPrimary(i == primaryIndex);
            contact.setSortOrder(i);
            if (item.getId() == null) {
                donor.getContacts().add(contact);
            }
        }
    }

    @Override
    public void activateDonor(Long id) {
        log.info("Activating donor with id: {}", id);

        DonorMaster donor = donorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Donor", id));

        donor.setIsActive(true);
        donorRepository.save(donor);

        log.info("Donor activated successfully");
    }

    @Override
    public void deActivateDonor(Long id) {
        log.info("Deactivating donor with id: {}", id);

        DonorMaster donor = donorRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Donor", id));

        donor.setIsActive(false);
        donorRepository.save(donor);

        log.info("Donor deactivated successfully");
    }

    // @Override
    // public void advanceOnboardingStep(Long donorId) {
    // log.info("Advancing onboarding step for donor with id: {}", donorId);

    // DonorMaster donor = donorRepository.findById(donorId)
    // .orElseThrow(() -> new ResourceNotFoundException("Donor", donorId));

    // if (donor.getOnboardingStep() < 10) {
    // donor.setOnboardingStep(donor.getOnboardingStep() + 1);
    // donorRepository.save(donor);
    // log.info("Onboarding step advanced to: {}", donor.getOnboardingStep());
    // }
    // }
}
