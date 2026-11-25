-- The Tally voucher a credit note was booked as, e.g. type "Receipt", no. "245".
-- Voucher numbers can repeat across voucher types, so type + number together
-- identify it; one Tally voucher can be on only one credit note.
ALTER TABLE credit_note
    ADD COLUMN tally_voucher_type VARCHAR(50),
    ADD COLUMN tally_voucher_no   VARCHAR(100);

ALTER TABLE credit_note ADD CONSTRAINT chk_credit_note_tally_type_needs_no
    CHECK (tally_voucher_type IS NULL OR tally_voucher_no IS NOT NULL);

CREATE UNIQUE INDEX ux_credit_note_tally_voucher
    ON credit_note (UPPER(COALESCE(tally_voucher_type, '')), UPPER(tally_voucher_no))
    WHERE tally_voucher_no IS NOT NULL;
