package com.ngo.finance.masters.overbudgetreason.api;

import com.ngo.finance.masters.overbudgetreason.dto.OverBudgetReasonRequest;
import com.ngo.finance.masters.overbudgetreason.dto.OverBudgetReasonResponse;
import com.ngo.finance.masters.overbudgetreason.service.OverBudgetReasonService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/over-budget-reasons")
@Tag(name = "Over-budget Reason", description = "Over-budget reason master APIs")
public class OverBudgetReasonController {

    private final OverBudgetReasonService service;

    @GetMapping
    @Operation(summary = "List over-budget reasons (activeOnly=true for the debit note form)")
    public ResponseEntity<List<OverBudgetReasonResponse>> list(
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "false") boolean activeOnly) {
        return ResponseEntity.ok(service.list(search, activeOnly));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get an over-budget reason")
    public ResponseEntity<OverBudgetReasonResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.get(id));
    }

    @PostMapping
    @Operation(summary = "Create an over-budget reason")
    public ResponseEntity<OverBudgetReasonResponse> create(@Valid @RequestBody OverBudgetReasonRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an over-budget reason")
    public ResponseEntity<OverBudgetReasonResponse> update(@PathVariable Long id, @Valid @RequestBody OverBudgetReasonRequest request) {
        return ResponseEntity.ok(service.update(id, request));
    }

    @PatchMapping("/{id}/activate")
    @Operation(summary = "Activate an over-budget reason")
    public ResponseEntity<Void> activate(@PathVariable Long id) {
        service.setActive(id, true);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/deactivate")
    @Operation(summary = "Deactivate an over-budget reason (notes that use it keep it)")
    public ResponseEntity<Void> deactivate(@PathVariable Long id) {
        service.setActive(id, false);
        return ResponseEntity.noContent().build();
    }
}
