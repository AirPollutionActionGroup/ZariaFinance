-- Adds AUDITOR_UTILISATION_CERTIFICATE as a release criterion type (CriterionType).
-- The existing UTILISATION_CERTIFICATE value is kept unchanged — it is now
-- labelled the management UC — so rows already stored stay valid.
ALTER TABLE donor_release_criteria DROP CONSTRAINT chk_release_criteria_type;

ALTER TABLE donor_release_criteria ADD CONSTRAINT chk_release_criteria_type CHECK (
    release_criteria IS NULL OR release_criteria IN (
        'ON_SIGNING', 'FIXED_DATE', 'MILESTONE_BASED', 'UTILISATION_THRESHOLD',
        'UTILISATION_CERTIFICATE', 'AUDITOR_UTILISATION_CERTIFICATE',
        'FINANCIAL_REPORT', 'NARRATIVE_REPORT', 'AUDIT_REPORT', 'DONOR_APPROVAL', 'OTHER'));
