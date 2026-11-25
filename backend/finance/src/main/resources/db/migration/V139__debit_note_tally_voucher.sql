-- The Tally voucher a debit note was booked as, e.g. type "Payment", no. "118".
-- Type + number identify it; one Tally voucher can be on only one debit note.
ALTER TABLE debit_note
    ADD COLUMN tally_voucher_type VARCHAR(50),
    ADD COLUMN tally_voucher_no   VARCHAR(100);

ALTER TABLE debit_note ADD CONSTRAINT chk_debit_note_tally_type_needs_no
    CHECK (tally_voucher_type IS NULL OR tally_voucher_no IS NOT NULL);

CREATE UNIQUE INDEX ux_debit_note_tally_voucher
    ON debit_note (UPPER(COALESCE(tally_voucher_type, '')), UPPER(tally_voucher_no))
    WHERE tally_voucher_no IS NOT NULL;
