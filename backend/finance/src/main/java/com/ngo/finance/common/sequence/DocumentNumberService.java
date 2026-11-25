package com.ngo.finance.common.sequence;

import java.time.LocalDate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hands out document numbers from {@code document_sequence}: one row per
 * (document type, financial year). The next number is taken with a single
 * upsert that locks that row, so two saves at the same moment can never get the
 * same number (unlike "highest existing code + 1"). The number is used inside
 * the caller's transaction — if the save rolls back, so does the number.
 */
@Service
public class DocumentNumberService {

    /** Document types numbered here. */
    public enum DocType {
        GRANT
    }

    private static final String NEXT_SQL = """
            INSERT INTO document_sequence (doc_type, period, last_no)
            VALUES (?, ?, 1)
            ON CONFLICT (doc_type, period) DO UPDATE SET last_no = document_sequence.last_no + 1
            RETURNING last_no
            """;

    private final JdbcTemplate jdbc;

    public DocumentNumberService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** The next number (1, 2, 3 …) for this type in this period, e.g. ("GRANT", "2026-27"). */
    @Transactional(propagation = Propagation.MANDATORY)
    public int next(DocType type, String period) {
        Integer n = jdbc.queryForObject(NEXT_SQL, Integer.class, type.name(), period);
        if (n == null) {
            throw new IllegalStateException("No number returned for " + type + " " + period);
        }
        return n;
    }

    /** Indian financial year (April–March) label for a date: 20 Nov 2026 → "2026-27", 10 Feb 2027 → "2026-27". */
    public static String financialYearOf(LocalDate date) {
        int start = date.getMonthValue() >= 4 ? date.getYear() : date.getYear() - 1;
        return String.format("%d-%02d", start, (start + 1) % 100);
    }
}
