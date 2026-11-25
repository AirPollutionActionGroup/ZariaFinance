-- Adds DATED as a tranche schedule type (ScheduleType): no fixed cadence —
-- each tranche is released on its own expected release date.
ALTER TABLE donor_tranche_criterion DROP CONSTRAINT chk_donor_criterion_frequency;

ALTER TABLE donor_tranche_criterion ADD CONSTRAINT chk_donor_criterion_frequency CHECK (
    frequency IN ('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'DATED'));
