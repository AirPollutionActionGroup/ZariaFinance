/**
 * Funding records — a fund profile (the terms) and the grant agreement signed
 * on it, worked with as one record through its whole life:
 *
 *   Terms (profile only) → Pending approval → Approved → On hold → Completed
 *
 * The server joins the two and works out the stage (GET /api/v1/funding); this
 * module holds the stage metadata and the pure helpers the pages share.
 */
import { FUND_CLASS_SHORT } from '../../donor-management/constants.js';

/** Lifecycle stages in display order. `approval` matches grant.isApproved. */
export const STAGES = Object.freeze([
  {
    key: 'terms',
    label: 'Terms only',
    hint: 'Fund profile set up — no grant agreement signed yet',
    tone: 'neutral',
    color: 'var(--muted)',
    approval: null,
  },
  {
    key: 'pending',
    label: 'Pending approval',
    hint: 'Agreement recorded, waiting for approval',
    tone: 'warning',
    color: 'var(--warn)',
    approval: 2,
  },
  {
    key: 'approved',
    label: 'Approved',
    hint: 'Agreement approved — live funding',
    tone: 'success',
    color: 'var(--ok)',
    approval: 1,
  },
  {
    key: 'onhold',
    label: 'On hold',
    hint: 'Agreement paused for review',
    tone: 'warning',
    color: 'var(--warn)',
    approval: 3,
  },
  {
    key: 'completed',
    label: 'Completed',
    hint: 'Agreement has run its course',
    tone: 'info',
    color: 'var(--info)',
    approval: 4,
  },
]);

export const STAGE_BY_KEY = Object.freeze(Object.fromEntries(STAGES.map((s) => [s.key, s])));

/**
 * The agreement's status steps open to it now (PATCH /funding/{id}/<step>).
 * isApproved: 1 approved · 2 pending · 3 on hold · 4 completed (terminal);
 * isActive false = closed (only re-activating is open, once approved).
 */
export function agreementActions(isApproved, isActive) {
  if (isApproved === 2) return ['approve'];
  if (isApproved === 1) return isActive ? ['hold', 'complete', 'close'] : ['activate'];
  if (isApproved === 3) return ['resume'];
  return [];
}

/** "A" | "B" | "C" | null — the backend sends either the letter or the full enum. */
export function classLetter(profile, grant) {
  const raw = profile?.fundClass || grant?.fundClassCode || null;
  if (!raw) return null;
  return FUND_CLASS_SHORT[raw] || (['A', 'B', 'C'].includes(raw) ? raw : null);
}

/** Total of a profile's disbursement rules (its committed schedule). */
export function profileCommitted(profile) {
  return (profile?.disbursementRules || []).reduce((sum, rule) => sum + (Number(rule.totalAmount) || 0), 0);
}

/** Count of records per stage key (every stage present, zero when empty). */
export function countByStage(records) {
  const counts = Object.fromEntries(STAGES.map((s) => [s.key, 0]));
  for (const record of records) counts[record.stage] += 1;
  return counts;
}

/** Case-insensitive match across the fields a user is likely to type. */
export function matchesSearch(record, term) {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [record.profileCode, record.grantCode, record.legacyCode, record.donorName, record.title, record.programmeName]
    .some((value) => value && String(value).toLowerCase().includes(needle));
}

/** FP-2026-014 / GA-2026-27-007 → sortable number, newest highest (the agreement's FY start year). */
export function codeSortValue(record) {
  const fp = /^FP-(\d{4})-(\d+)$/.exec(record.profileCode || '');
  if (fp) return Number(fp[1]) * 1_000_000 + Number(fp[2]);
  const ga = /^GA-(\d{4})-\d{2}-(\d+)$/.exec(record.grantCode || '');
  return ga ? Number(ga[1]) * 1_000_000 + Number(ga[2]) : null;
}
