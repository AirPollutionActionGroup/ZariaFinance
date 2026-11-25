package com.ngo.finance.funding.api;

import com.ngo.finance.common.exception.ValidationException;
import com.ngo.finance.donor.dto.request.ApproveGrantRequest;
import com.ngo.finance.donor.dto.request.GrantRemarksRequest;
import com.ngo.finance.donor.service.GrantService;
import com.ngo.finance.funding.dto.FundingHistoryEntry;
import com.ngo.finance.funding.dto.FundingListItem;
import com.ngo.finance.funding.dto.FundingRequest;
import com.ngo.finance.funding.dto.FundingResponse;
import com.ngo.finance.funding.dto.FundingStage;
import com.ngo.finance.funding.service.FundingChangeLogService;
import com.ngo.finance.funding.service.FundingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
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

/**
 * Funding: terms (fund profile) + signed agreement as one record. A record's id
 * is its fund profile's id. Everything about a funding record goes through
 * here — create, edit, read, list, its change history and the agreement's
 * status steps (approve / activate / hold / resume / complete / close).
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/funding")
@Tag(name = "Funding", description = "Fund profile and grant agreement as one record")
public class FundingController {

    @Autowired
    private FundingService fundingService;

    @Autowired
    private FundingChangeLogService changeLog;

    @Autowired
    private GrantService grantService;

    @PostMapping
    @Operation(summary = "Create funding: terms and (optionally) the signed agreement, in one transaction")
    public ResponseEntity<FundingResponse> create(@Valid @RequestBody FundingRequest request) {
        log.info("POST /api/v1/funding - donor {}", request.getDonorId());
        return ResponseEntity.status(HttpStatus.CREATED).body(fundingService.create(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update funding: terms, and create or update the agreement, in one transaction")
    public ResponseEntity<FundingResponse> update(@PathVariable Long id, @Valid @RequestBody FundingRequest request) {
        log.info("PUT /api/v1/funding/{}", id);
        return ResponseEntity.ok(fundingService.update(id, request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get one funding record: terms, agreement and stage")
    public ResponseEntity<FundingResponse> get(@PathVariable Long id) {
        return ResponseEntity.ok(fundingService.get(id));
    }

    @GetMapping("/{id}/history")
    @Operation(summary = "Change history of one funding record: each save and status step, newest first")
    public ResponseEntity<List<FundingHistoryEntry>> history(@PathVariable Long id) {
        fundingService.get(id); // 404 for an unknown record
        return ResponseEntity.ok(changeLog.history(id));
    }

    @GetMapping
    @Operation(summary = "List funding records, optionally by donor and/or stage")
    public ResponseEntity<List<FundingListItem>> list(
            @RequestParam(required = false) Long donorId,
            @RequestParam(required = false) FundingStage stage) {
        return ResponseEntity.ok(fundingService.list(donorId, stage));
    }

    /* ---------- the agreement's status steps ---------- */

    @PatchMapping("/{id}/approve")
    @Operation(summary = "Approve the agreement (pending → approved)")
    public ResponseEntity<Void> approve(
            @PathVariable Long id,
            @RequestBody(required = false) ApproveGrantRequest request,
            @RequestParam(required = false) String actor) {
        log.info("PATCH /api/v1/funding/{}/approve", id);
        grantService.approveGrant(agreementOf(id), request, actor);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/activate")
    @Operation(summary = "Re-activate a closed agreement (only once approved)")
    public ResponseEntity<Void> activate(@PathVariable Long id, @RequestParam(required = false) String actor) {
        log.info("PATCH /api/v1/funding/{}/activate", id);
        grantService.activateGrant(agreementOf(id), actor);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/hold")
    @Operation(summary = "Put the agreement on hold (approved → on hold)")
    public ResponseEntity<Void> hold(
            @PathVariable Long id,
            @RequestBody(required = false) GrantRemarksRequest request,
            @RequestParam(required = false) String actor) {
        log.info("PATCH /api/v1/funding/{}/hold", id);
        grantService.holdGrant(agreementOf(id), request, actor);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/resume")
    @Operation(summary = "Resume the agreement (on hold → approved)")
    public ResponseEntity<Void> resume(@PathVariable Long id, @RequestParam(required = false) String actor) {
        log.info("PATCH /api/v1/funding/{}/resume", id);
        grantService.resumeGrant(agreementOf(id), actor);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/complete")
    @Operation(summary = "Mark the agreement completed (approved → completed)")
    public ResponseEntity<Void> complete(@PathVariable Long id, @RequestParam(required = false) String actor) {
        log.info("PATCH /api/v1/funding/{}/complete", id);
        grantService.completeGrant(agreementOf(id), actor);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{id}/close")
    @Operation(summary = "Close the agreement — no further transactions can reference it")
    public ResponseEntity<Void> close(@PathVariable Long id, @RequestParam(required = false) String actor) {
        log.info("PATCH /api/v1/funding/{}/close", id);
        grantService.closeGrant(agreementOf(id), actor);
        return ResponseEntity.noContent().build();
    }

    /** The agreement on this funding record — 404 for an unknown record, 400 when none is recorded yet. */
    private Long agreementOf(Long profileId) {
        FundingResponse record = fundingService.get(profileId);
        if (record.getAgreement() == null) {
            throw new ValidationException("This funding has no grant agreement yet — record the agreement first.");
        }
        return record.getAgreement().getId();
    }
}
