package com.ngo.finance.masters.overbudgetreason.service;

import com.ngo.finance.common.exception.ResourceNotFoundException;
import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.masters.overbudgetreason.dto.OverBudgetReasonRequest;
import com.ngo.finance.masters.overbudgetreason.dto.OverBudgetReasonResponse;
import com.ngo.finance.masters.overbudgetreason.entity.OverBudgetReason;
import com.ngo.finance.masters.overbudgetreason.repository.OverBudgetReasonRepository;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Over-budget reason master: the reasons a debit note may give for taking its
 * budget line over budget. Debit notes point at a reason by id, so its name,
 * description and status can change freely.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class OverBudgetReasonService {

    private final OverBudgetReasonRepository repository;

    @Transactional(readOnly = true)
    public List<OverBudgetReasonResponse> list(String search, boolean activeOnly) {
        List<OverBudgetReason> rows;
        if (search != null && !search.isBlank()) {
            rows = repository.search(search.trim());
        } else if (activeOnly) {
            rows = repository.findByStatusTrueOrderByNameAsc();
        } else {
            rows = repository.findAllByOrderByNameAsc();
        }
        Map<Long, Long> used = usage();
        return rows.stream()
                .filter(r -> !activeOnly || Boolean.TRUE.equals(r.getStatus()))
                .map(r -> OverBudgetReasonResponse.of(r, used.getOrDefault(r.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public OverBudgetReasonResponse get(Long id) {
        return OverBudgetReasonResponse.of(findOrThrow(id), usage().getOrDefault(id, 0L));
    }

    public OverBudgetReasonResponse create(OverBudgetReasonRequest request) {
        String name = request.getName().trim();
        if (repository.existsByNameIgnoreCase(name)) {
            throw duplicate(name);
        }
        OverBudgetReason saved = repository.save(OverBudgetReason.builder()
                .name(name)
                .description(blankToNull(request.getDescription()))
                .status(request.getStatus() == null || request.getStatus())
                .build());
        log.info("Over-budget reason {} ({}) created", saved.getId(), saved.getName());
        return OverBudgetReasonResponse.of(saved, 0L);
    }

    public OverBudgetReasonResponse update(Long id, OverBudgetReasonRequest request) {
        OverBudgetReason entity = findOrThrow(id);
        String name = request.getName().trim();
        if (!name.equalsIgnoreCase(entity.getName()) && repository.existsByNameIgnoreCase(name)) {
            throw duplicate(name);
        }
        entity.setName(name);
        entity.setDescription(blankToNull(request.getDescription()));
        if (request.getStatus() != null) {
            entity.setStatus(request.getStatus());
        }
        return OverBudgetReasonResponse.of(repository.save(entity), usage().getOrDefault(id, 0L));
    }

    public void setActive(Long id, boolean active) {
        OverBudgetReason entity = findOrThrow(id);
        entity.setStatus(active);
        repository.save(entity);
        log.info("Over-budget reason {} {}", entity.getName(), active ? "activated" : "deactivated");
    }

    /**
     * The reason a new debit note gives: it must exist and be active. Errors
     * are on the {@code overBudgetReasonId} field.
     */
    @Transactional(readOnly = true)
    public OverBudgetReason requireActive(Long id) {
        OverBudgetReason reason = repository.findById(id)
                .orElseThrow(() -> invalid("Unknown over-budget reason"));
        if (!Boolean.TRUE.equals(reason.getStatus())) {
            throw invalid("Over-budget reason '" + reason.getName() + "' is not active");
        }
        return reason;
    }

    /** An active reason by name, ignoring case, spaces and punctuation ("fx difference" = "FX difference"). */
    @Transactional(readOnly = true)
    public Optional<OverBudgetReason> findActiveByName(String raw) {
        String key = letters(raw);
        return repository.findByStatusTrueOrderByNameAsc().stream()
                .filter(r -> letters(r.getName()).equals(key))
                .findFirst();
    }

    /** Names of the active reasons, for messages such as an import error. */
    @Transactional(readOnly = true)
    public List<String> activeNames() {
        return repository.findByStatusTrueOrderByNameAsc().stream().map(OverBudgetReason::getName).toList();
    }

    private Map<Long, Long> usage() {
        Map<Long, Long> used = new HashMap<>();
        for (Object[] row : repository.countDebitNotesByReason()) {
            used.put((Long) row[0], (Long) row[1]);
        }
        return used;
    }

    private static String letters(String text) {
        return text == null ? "" : text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static String blankToNull(String text) {
        return text == null || text.isBlank() ? null : text.trim();
    }

    private static ValidationException duplicate(String name) {
        String message = "An over-budget reason named '" + name + "' already exists";
        return new ValidationException(message, new HashMap<>(Map.of("name", message)));
    }

    private static ValidationException invalid(String message) {
        return new ValidationException(message, new HashMap<>(Map.of("overBudgetReasonId", message)));
    }

    private OverBudgetReason findOrThrow(Long id) {
        return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Over-budget reason", id));
    }
}
