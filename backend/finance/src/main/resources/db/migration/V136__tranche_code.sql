-- Every tranche gets a permanent, readable code: {profile code}-T{n}, e.g.
-- FP-2026-001-T2. Numbers follow creation order within the profile and are
-- never reused, so donor_fund_profile keeps the last number handed out.
ALTER TABLE donor_tranche_criterion ADD COLUMN tranche_code VARCHAR(40);
ALTER TABLE donor_fund_profile ADD COLUMN tranche_seq INTEGER NOT NULL DEFAULT 0;

-- Existing tranches: numbered by expected release date (then id) per profile.
WITH numbered AS (
    SELECT t.id,
           p.profile_code,
           ROW_NUMBER() OVER (PARTITION BY p.id
                              ORDER BY t.expected_release_date NULLS LAST, t.id) AS n
      FROM donor_tranche_criterion t
      JOIN donor_disbursement_rule r ON r.id = t.disbursement_rule_id
      JOIN donor_fund_profile p ON p.id = r.fund_profile_id)
UPDATE donor_tranche_criterion t
   SET tranche_code = numbered.profile_code || '-T' || numbered.n
  FROM numbered
 WHERE numbered.id = t.id;

UPDATE donor_fund_profile p
   SET tranche_seq = (SELECT COUNT(*)
                        FROM donor_tranche_criterion t
                        JOIN donor_disbursement_rule r ON r.id = t.disbursement_rule_id
                       WHERE r.fund_profile_id = p.id);

ALTER TABLE donor_tranche_criterion ALTER COLUMN tranche_code SET NOT NULL;
ALTER TABLE donor_tranche_criterion ADD CONSTRAINT uq_tranche_code UNIQUE (tranche_code);
