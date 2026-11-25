package com.ngo.finance.masters.documenttype.service;

import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.masters.documenttype.dto.DocumentTypeRequest;
import com.ngo.finance.masters.documenttype.dto.DocumentTypeResponse;
import com.ngo.finance.masters.documenttype.entity.DocumentTypeMaster;
import com.ngo.finance.masters.documenttype.repository.DocumentTypeMasterRepository;
import com.ngo.finance.common.enums.FundSourceDomicile;
import java.util.Locale;
import com.ngo.finance.masters.donortype.repository.DonorTypeMasterRepository;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Document Type master: the identity documents a donor can be identified by.
 * Donors point at a type by id, so its name and status can change freely.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class DocumentTypeService {

    private final DocumentTypeMasterRepository repository;
    private final DonorTypeMasterRepository donorTypeRepository;

    @Transactional(readOnly = true)
    public List<DocumentTypeResponse> list(String search, boolean activeOnly) {
        List<DocumentTypeMaster> rows;
        if (search != null && !search.isBlank()) {
            rows = repository.search(search.trim());
        } else if (activeOnly) {
            rows = repository.findByStatusTrueOrderByNameAsc();
        } else {
            rows = repository.findAllByOrderByNameAsc();
        }
        return rows.stream()
                .filter(d -> !activeOnly || Boolean.TRUE.equals(d.getStatus()))
                .map(DocumentTypeResponse::of)
                .toList();
    }

    @Transactional(readOnly = true)
    public DocumentTypeResponse get(Long id) {
        return DocumentTypeResponse.of(findOrThrow(id));
    }

    public DocumentTypeResponse create(DocumentTypeRequest request) {
        String name = request.getName().trim();
        if (repository.existsByNameIgnoreCase(name)) {
            throw new ValidationException("A document type named '" + name + "' already exists");
        }
        DocumentTypeMaster saved = repository.save(DocumentTypeMaster.builder()
                .name(name)
                .status(request.getStatus() == null || request.getStatus())
                .allowedFundSourceDomiciles(domicilesOf(request))
                .requiredForDonorTypeIds(donorTypesOf(request))
                .build());
        log.info("Document type {} ({}) created", saved.getId(), saved.getName());
        return DocumentTypeResponse.of(saved);
    }

    /** Renames a document type and updates its domicile(s) and the donor types it is required for. */
    public DocumentTypeResponse update(Long id, DocumentTypeRequest request) {
        DocumentTypeMaster entity = findOrThrow(id);
        String name = request.getName().trim();
        if (!name.equalsIgnoreCase(entity.getName()) && repository.existsByNameIgnoreCase(name)) {
            throw new ValidationException("A document type named '" + name + "' already exists");
        }
        entity.setName(name);
        Set<FundSourceDomicile> domiciles = domicilesOf(request);
        entity.getAllowedFundSourceDomiciles().clear();
        entity.getAllowedFundSourceDomiciles().addAll(domiciles);
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        if (request.getRequiredForDonorTypeIds() != null) {
            Set<Long> ids = donorTypesOf(request);
            entity.getRequiredForDonorTypeIds().clear();
            entity.getRequiredForDonorTypeIds().addAll(ids);
        }
        return DocumentTypeResponse.of(repository.save(entity));
    }

    public void setActive(Long id, boolean active) {
        DocumentTypeMaster entity = findOrThrow(id);
        entity.setStatus(active);
        repository.save(entity);
        log.info("Document type {} {}", entity.getName(), active ? "activated" : "deactivated");
    }

    /**
     * Checks a donor's document type: null is allowed (no document); otherwise
     * it must be a known type offered to the donor's fund source domicile. A new
     * choice must also be active, but a donor may keep a type that was
     * deactivated (or narrowed) after it was saved.
     *
     * @return the document type id, or null
     */
    @Transactional(readOnly = true)
    public Long requireUsable(Long id, Long currentId, FundSourceDomicile domicile) {
        if (id == null) {
            return null;
        }
        DocumentTypeMaster type = repository.findById(id)
                .orElseThrow(() -> new ValidationException("Unknown document type", errors("documentTypeId", "Unknown document type")));
        boolean kept = id.equals(currentId);
        if (!Boolean.TRUE.equals(type.getStatus()) && !kept) {
            throw new ValidationException("Document type '" + type.getName() + "' is not active");
        }
        if (!type.appliesTo(domicile) && !kept) {
            String message = type.getName() + " is not used for " + domicile.getLabel().toLowerCase(Locale.ROOT) + " donors";
            throw new ValidationException(message, errors("documentTypeId", message));
        }
        return id;
    }

    /**
     * Checks a donor's ID document against its donor type: when the donor type
     * has required document types (active, and offered to the donor's domicile),
     * the donor must give one of them. Errors are on the {@code documentTypeId} field.
     */
    @Transactional(readOnly = true)
    public void requireForDonorType(Long donorTypeId, String donorTypeName, Long documentTypeId, FundSourceDomicile domicile) {
        if (donorTypeId == null) {
            return;
        }
        List<DocumentTypeMaster> required = repository.findActiveRequiredFor(donorTypeId).stream()
                .filter(t -> t.appliesTo(domicile))
                .toList();
        if (required.isEmpty()) {
            return;
        }
        boolean given = documentTypeId != null && required.stream().anyMatch(t -> t.getId().equals(documentTypeId));
        if (!given) {
            String names = String.join(" or ", required.stream().map(DocumentTypeMaster::getName).toList());
            String message = (donorTypeName != null ? donorTypeName : "This donor type") + " donors need " + names;
            throw new ValidationException(message, errors("documentTypeId", message));
        }
    }

    /** The donor-type ids on a request, checked to exist. */
    private Set<Long> donorTypesOf(DocumentTypeRequest request) {
        if (request.getRequiredForDonorTypeIds() == null || request.getRequiredForDonorTypeIds().isEmpty()) {
            return new HashSet<>();
        }
        Set<Long> ids = new HashSet<>(request.getRequiredForDonorTypeIds());
        ids.remove(null);
        long known = donorTypeRepository.findAllById(ids).size();
        if (known != ids.size()) {
            throw new ValidationException("One of the chosen donor types doesn't exist");
        }
        return ids;
    }

    /** The request's domicile(s) — at least one (also enforced by @NotEmpty on the request). */
    private static Set<FundSourceDomicile> domicilesOf(DocumentTypeRequest request) {
        Set<FundSourceDomicile> domiciles = request.getAllowedFundSourceDomiciles() == null
                ? new HashSet<>()
                : new HashSet<>(request.getAllowedFundSourceDomiciles());
        domiciles.remove(null);
        if (domiciles.isEmpty()) {
            String message = "Choose the fund source domicile — Domestic, Foreign or both";
            throw new ValidationException(message, errors("allowedFundSourceDomiciles", message));
        }
        return domiciles;
    }

    private static java.util.Map<String, String> errors(String field, String message) {
        return new java.util.HashMap<>(java.util.Map.of(field, message));
    }

    private DocumentTypeMaster findOrThrow(Long id) {
        return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Document type", id));
    }
}
