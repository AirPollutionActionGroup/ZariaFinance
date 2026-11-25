-- Funding Agreements is now the only way fund profiles and grant agreements are
-- written (the old /fund-profiles and /grants pages and write APIs are gone).
-- Bring older rows in line with the rules Funding enforces, then let the
-- database enforce them too.

-- 1 · Fund mode decides the class and programme-tied.
--     Restricted   → Class A, programme-tied. (A profile with no programme keeps
--                    none; the form asks for one on its next edit.)
UPDATE donor_fund_profile
   SET fund_class = 'CLASS_A_RESTRICTED',
       programme_tied = TRUE
 WHERE fund_mode = 'RESTRICTED'
   AND (fund_class IS DISTINCT FROM 'CLASS_A_RESTRICTED' OR programme_tied IS NOT TRUE);

--     Unrestricted → Class B or C (no class recorded → Class C · Fully
--                    unrestricted), not programme-tied.
UPDATE donor_fund_profile
   SET fund_class = 'CLASS_C_UNRESTRICTED'
 WHERE fund_mode = 'UNRESTRICTED'
   AND (fund_class IS NULL OR fund_class = 'CLASS_A_RESTRICTED');

UPDATE donor_fund_profile
   SET programme_tied = FALSE
 WHERE fund_mode = 'UNRESTRICTED'
   AND programme_tied IS NOT FALSE;

-- 2 · An agreement's total is a copy of its terms' committed amount; refresh
--     any copy that fell behind an edit of the terms.
UPDATE grant_agreement g
   SET total_grant_amount = t.committed
  FROM (SELECT fund_profile_id, SUM(total_amount) AS committed
          FROM donor_disbursement_rule
         GROUP BY fund_profile_id) t
 WHERE t.fund_profile_id = g.fund_profile_id
   AND t.committed > 0
   AND g.total_grant_amount <> t.committed;

-- 3 · Constraints matching what Funding guarantees.
ALTER TABLE donor_fund_profile
    ALTER COLUMN fund_mode SET NOT NULL,
    ALTER COLUMN fund_class SET NOT NULL,
    ALTER COLUMN programme_tied SET NOT NULL,
    ALTER COLUMN movement_allowed SET NOT NULL,
    ALTER COLUMN explanation_required SET NOT NULL,
    ALTER COLUMN onboarding_complete SET NOT NULL;

ALTER TABLE donor_fund_profile ADD CONSTRAINT chk_profile_mode_class CHECK (
    (fund_mode = 'RESTRICTED' AND fund_class = 'CLASS_A_RESTRICTED' AND programme_tied)
    OR
    (fund_mode = 'UNRESTRICTED' AND fund_class IN ('CLASS_B_UNRESTRICTED', 'CLASS_C_UNRESTRICTED')
        AND NOT programme_tied));

-- Every agreement is signed on a fund profile (Funding always sets it).
ALTER TABLE grant_agreement ALTER COLUMN fund_profile_id SET NOT NULL;

-- 4 · Indexes that duplicated others:
--     idx_grant_code            = the grant_code UNIQUE constraint's index
--     idx_grant_dates_range     = idx_grant_dates (start_date, end_date)
--     idx_grant_fund_profile_id = the uq_grant_fund_profile UNIQUE constraint's index
DROP INDEX IF EXISTS idx_grant_code;
DROP INDEX IF EXISTS idx_grant_dates_range;
DROP INDEX IF EXISTS idx_grant_fund_profile_id;
