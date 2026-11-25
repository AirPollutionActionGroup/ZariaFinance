package com.ngo.finance.funding.service;

import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.dto.response.GrantDetailsResponse;
import com.ngo.finance.funding.dto.FundingHistoryEntry;
import com.ngo.finance.funding.entity.FundingChangeLog;
import com.ngo.finance.funding.enums.FundingChangeAction;
import com.ngo.finance.funding.repository.FundingChangeLogRepository;
import com.ngo.finance.funding.service.FundingSnapshot.Change;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes and reads the funding change log. Writes join the caller's
 * transaction, so a save that fails leaves no log behind; a save that changes
 * nothing writes nothing.
 */
@Service
public class FundingChangeLogService {

    private final FundingChangeLogRepository repository;

    public FundingChangeLogService(FundingChangeLogRepository repository) {
        this.repository = repository;
    }

    /** A new funding record (and its agreement, when recorded with it). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordCreated(FundProfileResponse terms, GrantDetailsResponse agreement, String actor, String note) {
        String group = newGroup();
        List<FundingChangeLog> rows = new ArrayList<>();
        rows.add(row(terms.getId(), agreement, group, FundingChangeAction.CREATED, "Funding", "Funding record",
                null, terms.getProfileCode(), note, actor));
        if (agreement != null) {
            rows.add(row(terms.getId(), agreement, group, FundingChangeAction.CREATED, "Agreement", "Agreement",
                    null, agreementLine(agreement), null, actor));
        }
        repository.saveAll(rows);
    }

    /**
     * An edit: every field that differs between the two snapshots, as one entry.
     * Recording a first agreement on the record makes it an "Agreement recorded" entry.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public int recordUpdate(Long profileId, FundingSnapshot before, FundingSnapshot after,
                            GrantDetailsResponse agreement, String actor, String note) {
        List<Change> changes = after.changesFrom(before);
        boolean agreementAdded = !before.hasAgreement() && after.hasAgreement();
        if (changes.isEmpty() && !agreementAdded) {
            return 0;
        }
        FundingChangeAction action = agreementAdded ? FundingChangeAction.AGREEMENT_ADDED : FundingChangeAction.UPDATED;
        String group = newGroup();
        List<FundingChangeLog> rows = new ArrayList<>();
        if (agreementAdded) {
            rows.add(row(profileId, agreement, group, action, "Agreement", "Agreement", null, agreementLine(agreement), note, actor));
        }
        for (Change c : changes) {
            // The new agreement's own fields are already summed up in its line above.
            if (agreementAdded && "Agreement".equals(c.section())) {
                continue;
            }
            rows.add(row(profileId, agreement, group, action, c.section(), c.label(), c.from(), c.to(), rows.isEmpty() ? note : null, actor));
        }
        repository.saveAll(rows);
        return rows.size();
    }

    /** A status step on the agreement (approve, hold, resume, complete, close, activate). */
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordStatus(Long profileId, Long grantId, FundingChangeAction action, String from, String to,
                             String note, String actor) {
        if (profileId == null) {
            return; // an agreement without a funding record has no history page
        }
        repository.save(FundingChangeLog.builder()
                .fundProfileId(profileId)
                .grantId(grantId)
                .changeGroup(newGroup())
                .action(action)
                .section("Status")
                .fieldLabel("Stage")
                .oldValue(from)
                .newValue(to)
                .note(trim(note))
                .changedBy(trim(actor))
                .build());
    }

    /** The record's history, newest entry first; each entry lists its field changes in order. */
    @Transactional(readOnly = true)
    public List<FundingHistoryEntry> history(Long profileId) {
        Map<String, List<FundingChangeLog>> groups = new LinkedHashMap<>();
        for (FundingChangeLog r : repository.findByFundProfileIdOrderByIdAsc(profileId)) {
            groups.computeIfAbsent(r.getChangeGroup(), k -> new ArrayList<>()).add(r);
        }
        List<FundingHistoryEntry> entries = new ArrayList<>();
        for (Map.Entry<String, List<FundingChangeLog>> g : groups.entrySet()) {
            List<FundingChangeLog> rows = g.getValue();
            FundingChangeLog first = rows.get(0);
            entries.add(FundingHistoryEntry.builder()
                    .id(g.getKey())
                    .action(first.getAction().name())
                    .actionLabel(first.getAction().getLabel())
                    .changedAt(first.getChangedAt())
                    .changedBy(first.getChangedBy())
                    .note(rows.stream().map(FundingChangeLog::getNote).filter(n -> n != null && !n.isBlank()).findFirst().orElse(null))
                    .changes(rows.stream()
                            .map(r -> FundingHistoryEntry.FieldChange.builder()
                                    .section(r.getSection())
                                    .field(r.getFieldLabel())
                                    .from(r.getOldValue())
                                    .to(r.getNewValue())
                                    .build())
                            .toList())
                    .build());
        }
        // Newest first; entries written at the same moment keep their written order, newest last-written first.
        List<FundingHistoryEntry> ordered = new ArrayList<>(entries);
        java.util.Collections.reverse(ordered);
        ordered.sort(Comparator.comparing(FundingHistoryEntry::getChangedAt, Comparator.nullsLast(Comparator.reverseOrder())));
        return ordered;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private static FundingChangeLog row(Long profileId, GrantDetailsResponse agreement, String group, FundingChangeAction action,
                                        String section, String label, String from, String to, String note, String actor) {
        return FundingChangeLog.builder()
                .fundProfileId(profileId)
                .grantId(agreement != null ? agreement.getId() : null)
                .changeGroup(group)
                .action(action)
                .section(section)
                .fieldLabel(label)
                .oldValue(from)
                .newValue(to)
                .note(trim(note))
                .changedBy(trim(actor))
                .build();
    }

    private static String agreementLine(GrantDetailsResponse a) {
        StringBuilder s = new StringBuilder(a.getGrantCode() != null ? a.getGrantCode() : "Agreement");
        if (a.getAgreementDate() != null) {
            s.append(" · signed ").append(a.getAgreementDate().format(java.time.format.DateTimeFormatter.ofPattern("dd MMM yyyy", java.util.Locale.ENGLISH)));
        }
        if (a.getTotalGrantAmount() != null) {
            s.append(" · ").append(FundingSnapshot.inr(a.getTotalGrantAmount()));
        }
        return s.toString();
    }

    private static String newGroup() {
        return UUID.randomUUID().toString();
    }

    private static String trim(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > 1000 ? t.substring(0, 1000) : t;
    }
}
