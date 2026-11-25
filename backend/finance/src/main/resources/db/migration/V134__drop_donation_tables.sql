-- The Donations module (/donations pages, /api/v1/donations and its tenant
-- tax config, /api/v1/tenant) was removed. Money received is recorded as
-- credit notes against funding, so these tables have no code left using them.
-- Nothing references them from outside, and the donation tables were empty
-- when this was written; tenant_tax_config held the 80G registration used on
-- donation receipts.
DROP TABLE IF EXISTS
    donation_gik_intended_use_change,
    donation_gik_item,
    donation_location,
    donation_corpus_detail,
    donation_legacy_detail,
    donation_payroll_employee,
    donation_payroll_batch,
    donation_recurring_mandate,
    donation,
    tenant_tax_config;
