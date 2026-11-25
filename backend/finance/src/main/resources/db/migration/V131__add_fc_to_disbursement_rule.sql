-- Foreign contribution (FC book): the donor commits in a foreign currency.
-- total_amount stays the INR figure; these columns keep what it was derived
-- from (foreign_amount × fx_rate) and where the rate came from. All five are
-- set together for an FC commitment, or all left NULL for an INR one.
ALTER TABLE donor_disbursement_rule
    ADD COLUMN currency       VARCHAR(3),
    ADD COLUMN foreign_amount NUMERIC(19, 2),
    ADD COLUMN fx_rate        NUMERIC(19, 4),
    ADD COLUMN fx_rate_date   DATE,
    ADD COLUMN fx_rate_source VARCHAR(20);

ALTER TABLE donor_disbursement_rule ADD CONSTRAINT chk_disb_fc_all_or_none CHECK (
    (currency IS NULL AND foreign_amount IS NULL AND fx_rate IS NULL
        AND fx_rate_date IS NULL AND fx_rate_source IS NULL)
    OR
    (currency IS NOT NULL AND foreign_amount IS NOT NULL AND fx_rate IS NOT NULL
        AND fx_rate_date IS NOT NULL AND fx_rate_source IS NOT NULL));

ALTER TABLE donor_disbursement_rule ADD CONSTRAINT chk_disb_fc_values CHECK (
    (foreign_amount IS NULL OR foreign_amount > 0)
    AND (fx_rate IS NULL OR fx_rate > 0)
    AND (fx_rate_source IS NULL OR fx_rate_source IN ('FBIL', 'ECB', 'MANUAL')));
