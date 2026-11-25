-- FC credit notes record what actually arrived in the donor's currency and the
-- rate it was converted at: amount (INR) = foreign_amount × fx_rate. All three
-- are set together, or all left NULL for an INR receipt.
ALTER TABLE credit_note
    ADD COLUMN currency       VARCHAR(3),
    ADD COLUMN foreign_amount NUMERIC(19, 2),
    ADD COLUMN fx_rate        NUMERIC(19, 4);

ALTER TABLE credit_note ADD CONSTRAINT chk_credit_note_fc_all_or_none CHECK (
    (currency IS NULL AND foreign_amount IS NULL AND fx_rate IS NULL)
    OR
    (currency IS NOT NULL AND foreign_amount > 0 AND fx_rate > 0));
