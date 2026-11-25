package com.ngo.finance.funding.service;

import com.ngo.finance.donor.dto.response.FundProfileResponse;
import com.ngo.finance.donor.dto.response.FundProfileResponse.DisbursementRuleItem;
import com.ngo.finance.donor.dto.response.FundProfileResponse.ReleaseCriterionItem;
import com.ngo.finance.donor.dto.response.FundProfileResponse.TrancheCriterionItem;
import com.ngo.finance.donor.dto.response.GrantDetailsResponse;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * A funding record (terms + agreement) as readable "section · field → value"
 * text, for the change log. Two snapshots — before and after a save — are
 * compared field by field; tranches are matched by their code, so an added or
 * removed tranche is one summary change instead of a row per field.
 */
public final class FundingSnapshot {

    /** One field: where it sits, its label, and its value as shown to people (null = empty). */
    public record Field(String section, String label, String value) {
    }

    /** One change between two snapshots. */
    public record Change(String section, String label, String from, String to) {
    }

    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);
    private static final Locale INDIA = Locale.forLanguageTag("en-IN");

    private final Map<String, Field> fields = new LinkedHashMap<>();
    /** Tranche code → its fields (key → field) and a one-line summary. */
    private final Map<String, Map<String, Field>> tranches = new LinkedHashMap<>();
    private final Map<String, String> trancheSummaries = new LinkedHashMap<>();
    private final boolean hasAgreement;

    private FundingSnapshot(FundProfileResponse terms, GrantDetailsResponse agreement) {
        this.hasAgreement = agreement != null;
        if (terms != null) {
            readTerms(terms);
        }
        if (agreement != null) {
            readAgreement(agreement);
        }
    }

    public static FundingSnapshot of(FundProfileResponse terms, GrantDetailsResponse agreement) {
        return new FundingSnapshot(terms, agreement);
    }

    public boolean hasAgreement() {
        return hasAgreement;
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    private void put(String key, String section, String label, String value) {
        fields.put(key, new Field(section, label, blankToNull(value)));
    }

    private void readTerms(FundProfileResponse t) {
        String terms = "Terms";
        put("fundMode", terms, "Fund mode", t.getFundMode());
        put("fundClass", terms, "Fund class", firstNonBlank(t.getFundClassLabel(), t.getFundClass()));
        put("purpose", terms, "Purpose", t.getPurpose());
        put("programme", terms, "Linked to",
                t.getProgrammeName() == null ? null
                        : t.getProgrammeName() + (t.getProgrammeType() != null ? " (" + t.getProgrammeType() + ")" : ""));
        put("reporting", terms, "Reporting frequency", firstNonBlank(t.getReportingFrequencyLabel(), t.getReportingFrequency()));
        put("movement", terms, "Movement between lines allowed", yesNo(t.getMovementAllowed()));
        put("explanation", terms, "Explanation required", yesNo(t.getExplanationRequired()));
        put("geographies", "Geographies", "Geographies", t.getGeographies() == null ? null
                : t.getGeographies().stream()
                        .map(g -> g.getCityName() != null ? g.getStateName() + " · " + g.getCityName() : g.getStateName())
                        .filter(Objects::nonNull).sorted().collect(Collectors.joining(", ")));
        if (t.getUtilisationRules() != null) {
            for (var r : t.getUtilisationRules()) {
                String type = firstNonBlank(r.getOtherRuleType(), r.getRuleTypeLabel(), r.getRuleType());
                String value = joinNonBlank(" — ",
                        r.getLimitPercentage() != null ? plain(r.getLimitPercentage()) + "%" : null, r.getDescription());
                put("rule." + type, "Utilisation rules", type, value);
            }
        }
        if (t.getDisbursementRules() != null && !t.getDisbursementRules().isEmpty()) {
            readDisbursement(t.getDisbursementRules().get(0));
        }
    }

    private void readDisbursement(DisbursementRuleItem d) {
        String s = "Disbursement";
        put("disb.type", s, "Disbursement type", firstNonBlank(d.getDisbursementTypeLabel(), d.getDisbursementType()));
        put("disb.total", s, "Total committed", inr(d.getTotalAmount()));
        put("disb.date", s, "Expected release date", date(d.getReceivingDate()));
        if (d.getCurrency() != null) {
            put("disb.currency", s, "Currency", d.getCurrency());
            put("disb.foreign", s, "Amount in " + d.getCurrency(), foreign(d.getCurrency(), d.getForeignAmount()));
            put("disb.fxRate", s, "FX rate", d.getFxRate() != null ? "₹" + plain(d.getFxRate()) + " per " + d.getCurrency() : null);
            put("disb.fxDate", s, "FX rate date", date(d.getFxRateDate()));
            put("disb.fxSource", s, "FX rate source", firstNonBlank(d.getFxRateSourceLabel(), d.getFxRateSource()));
        }
        List<TrancheCriterionItem> items = d.getTrancheCriteria() == null ? List.of() : d.getTrancheCriteria();
        boolean lumpSum = "LUMP_SUM".equals(d.getDisbursementType());
        for (int i = 0; i < items.size(); i++) {
            TrancheCriterionItem tr = items.get(i);
            if (lumpSum) {
                // A lump sum is one tranche on the wire: only its release criteria matter here.
                put("disb.criteria", s, "Release criteria", criteria(tr.getCriteria()));
                continue;
            }
            String code = tr.getTrancheCode() != null ? tr.getTrancheCode() : "new-" + i;
            String section = "Tranche " + (i + 1) + (tr.getTrancheCode() != null ? " · " + tr.getTrancheCode() : "");
            Map<String, Field> f = new LinkedHashMap<>();
            f.put("amount", new Field(section, "Amount", blankToNull(inr(tr.getAmountCriteria()))));
            if (tr.getForeignAmount() != null) {
                f.put("foreign", new Field(section, "Amount in " + d.getCurrency(), foreign(d.getCurrency(), tr.getForeignAmount())));
            }
            f.put("date", new Field(section, "Expected release date", date(tr.getExpectedReleaseDate())));
            f.put("frequency", new Field(section, "Frequency", blankToNull(firstNonBlank(tr.getFrequencyLabel(), tr.getFrequency()))));
            f.put("final", new Field(section, "Final tranche", yesNo(tr.getIsFinalTranche())));
            f.put("criteria", new Field(section, "Release criteria", blankToNull(criteria(tr.getCriteria()))));
            tranches.put(code, f);
            trancheSummaries.put(code, joinNonBlank(" · ", inr(tr.getAmountCriteria()), date(tr.getExpectedReleaseDate())));
        }
    }

    private void readAgreement(GrantDetailsResponse a) {
        String s = "Agreement";
        put("ga.name", s, "Agreement name", a.getAgreementName());
        put("ga.date", s, "Signed on", date(a.getAgreementDate()));
        put("ga.start", s, "Start date", date(a.getStartDate()));
        put("ga.end", s, "End date", date(a.getEndDate()));
        put("ga.remarks", s, "Remarks", a.getDescription());
        put("ga.document", s, "Signed agreement document", a.getAgreementDocumentPath());
    }

    // ── Comparing ───────────────────────────────────────────────────────────

    /** Every field that differs from {@code before} to this snapshot, in reading order. */
    public List<Change> changesFrom(FundingSnapshot before) {
        List<Change> out = new ArrayList<>();
        for (Map.Entry<String, Field> e : fields.entrySet()) {
            Field now = e.getValue();
            Field was = before.fields.get(e.getKey());
            String old = was != null ? was.value() : null;
            if (!Objects.equals(old, now.value())) {
                out.add(new Change(now.section(), now.label(), old, now.value()));
            }
        }
        for (Map.Entry<String, Field> e : before.fields.entrySet()) {
            if (!fields.containsKey(e.getKey()) && e.getValue().value() != null) {
                Field was = e.getValue();
                out.add(new Change(was.section(), was.label(), was.value(), null));
            }
        }
        for (Map.Entry<String, Map<String, Field>> e : tranches.entrySet()) {
            Map<String, Field> was = before.tranches.get(e.getKey());
            if (was == null) {
                Field any = e.getValue().values().iterator().next();
                out.add(new Change(any.section(), "Tranche added", null, trancheSummaries.get(e.getKey())));
                continue;
            }
            for (Map.Entry<String, Field> f : e.getValue().entrySet()) {
                Field old = was.get(f.getKey());
                String oldValue = old != null ? old.value() : null;
                if (!Objects.equals(oldValue, f.getValue().value())) {
                    out.add(new Change(f.getValue().section(), f.getValue().label(), oldValue, f.getValue().value()));
                }
            }
        }
        for (Map.Entry<String, Map<String, Field>> e : before.tranches.entrySet()) {
            if (!tranches.containsKey(e.getKey())) {
                Field any = e.getValue().values().iterator().next();
                out.add(new Change(any.section(), "Tranche removed", before.trancheSummaries.get(e.getKey()), null));
            }
        }
        return out;
    }

    // ── Formatting ──────────────────────────────────────────────────────────

    private static String criteria(List<ReleaseCriterionItem> items) {
        if (items == null || items.isEmpty()) {
            return null;
        }
        return items.stream().map(c -> {
            String what = firstNonBlank(c.getReleaseCriteriaLabel(), c.getReleaseCriteria());
            String detail = joinNonBlank(" ",
                    c.getMilestoneName(),
                    c.getReleaseDate() != null ? "on " + date(c.getReleaseDate()) : null,
                    c.getTargetDate() != null ? "by " + date(c.getTargetDate()) : null,
                    c.getUtilisationPercentage() != null ? plain(BigDecimal.valueOf(c.getUtilisationPercentage())) + "%" : null);
            return detail == null ? what : what + " (" + detail + ")";
        }).collect(Collectors.joining("; "));
    }

    static String inr(BigDecimal amount) {
        if (amount == null) {
            return null;
        }
        NumberFormat f = NumberFormat.getNumberInstance(INDIA);
        f.setMaximumFractionDigits(2);
        f.setMinimumFractionDigits(0);
        return "₹" + f.format(amount);
    }

    private static String foreign(String currency, BigDecimal amount) {
        if (amount == null) {
            return null;
        }
        NumberFormat f = NumberFormat.getNumberInstance(INDIA);
        f.setMaximumFractionDigits(2);
        return (currency != null ? currency + " " : "") + f.format(amount);
    }

    private static String plain(BigDecimal n) {
        return n.stripTrailingZeros().toPlainString();
    }

    private static String date(LocalDate d) {
        return d == null ? null : d.format(DATE);
    }

    private static String yesNo(Boolean b) {
        return b == null ? null : (b ? "Yes" : "No");
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private static String joinNonBlank(String sep, String... values) {
        String joined = java.util.Arrays.stream(values).filter(v -> v != null && !v.isBlank()).collect(Collectors.joining(sep));
        return joined.isEmpty() ? null : joined;
    }
}
