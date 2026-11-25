package com.ngo.finance.donor.dto.response;

import com.ngo.finance.transaction.dto.response.CreditNoteImportResponse;
import java.util.ArrayList;
import java.util.List;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** What happened to each row of a donor import (or would happen, on a dry run). */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DonorImportResponse {

    private boolean dryRun;

    private int createdCount;

    @Builder.Default
    private List<RowResult> rows = new ArrayList<>();

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RowResult {
        private int rowNumber;
        /** Same statuses as the note imports: READY, WARNING, ERROR, IMPORTED, SKIPPED. */
        private CreditNoteImportResponse.Status status;
        @Builder.Default
        private List<String> errors = new ArrayList<>();
        @Builder.Default
        private List<String> warnings = new ArrayList<>();
        /** Same donor name as an existing donor, or an earlier row in the file. */
        private boolean duplicate;

        // What the row resolved to (as far as it could be read).
        /** The donor code given, or the one it gets. */
        private String donorCode;
        private String donorName;
        private String donorType;
        /** "Domestic" / "Foreign". */
        private String domicile;
        /** "LC" / "FC". */
        private String book;
        /** e.g. "PAN Card ABCDE1234F". */
        private String idDocument;
        private String contactName;
        private String contactEmail;
        /** Set once imported. */
        private Long donorId;
    }
}
