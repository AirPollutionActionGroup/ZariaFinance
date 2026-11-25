import { financialYearOf } from './lib/financialYear.js';

/** Approval lifecycle of a budget: Draft → Submitted → Approved | Rejected (→ back to Draft on edit). */
export const BUDGET_STATUS = Object.freeze({
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

export const BUDGET_STATUS_TONE = Object.freeze({
  DRAFT: 'neutral',
  SUBMITTED: 'info',
  APPROVED: 'success',
  REJECTED: 'error',
});

/**
 * What a budget is planned for: one programme, one project (a programme record
 * of type Project), or the organisation as a whole (overheads, admin, shared
 * costs). Any of them can be tied to one State.
 */
// Listed widest scope first: organisation → programme → project.
export const BUDGET_TYPE = Object.freeze({
  ORGANISATION: 'Organisation-based',
  PROGRAMME: 'Programme-based',
  PROJECT: 'Project-based',
});

export const BUDGET_TYPE_HINT = Object.freeze({
  ORGANISATION: 'Overheads, admin and shared costs',
  PROGRAMME: "One programme's activities and grant spend",
  PROJECT: 'One project under a programme',
});

export const BUDGET_TYPE_TONE = Object.freeze({ PROGRAMME: 'info', PROJECT: 'outlined', ORGANISATION: 'graphite' });

/** Programme and Project budgets are tied to one programme record; Organisation ones are org-wide. */
export const needsProgramme = (budgetType) => budgetType === 'PROGRAMME' || budgetType === 'PROJECT';

/** Which programme records a budget type can pick: PROGRAMME → type Programme, PROJECT → type Project. */
export const isProjectRecord = (programme) => String(programme?.type || '').toLowerCase() === 'project';

/** Budgets saved before types existed were all programme budgets. */
export const budgetTypeOf = (budget) => budget?.budgetType || 'PROGRAMME';

/** Scope label for an organisation budget. */
export const ORGANISATION_WIDE = 'Organisation-wide';

/** Indian FY quarters — a line's amount is phased across these. */
export const QUARTERS = Object.freeze([
  { key: 'q1', label: 'Q1', months: 'Apr–Jun' },
  { key: 'q2', label: 'Q2', months: 'Jul–Sep' },
  { key: 'q3', label: 'Q3', months: 'Oct–Dec' },
  { key: 'q4', label: 'Q4', months: 'Jan–Mar' },
]);

/** Today's FY label — a fallback only; the Budget pages default to the Financial Year master's active year. */
export const CURRENT_FINANCIAL_YEAR = financialYearOf();
