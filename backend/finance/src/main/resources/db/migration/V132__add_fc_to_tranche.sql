-- Per-tranche amount in the commitment's foreign currency (FC book only).
-- amount_criteria stays the INR figure; NULL for INR commitments.
ALTER TABLE donor_tranche_criterion
    ADD COLUMN foreign_amount NUMERIC(19, 2);

ALTER TABLE donor_tranche_criterion ADD CONSTRAINT chk_donor_criterion_foreign_amount CHECK (
    foreign_amount IS NULL OR foreign_amount > 0);
