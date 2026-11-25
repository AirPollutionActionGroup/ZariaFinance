/**
 * Budgets → CSV, two ways:
 *  - budgetsCsv:     one row per budget (code, scope, status, total, lines …)
 *  - budgetLinesCsv: one row per budget line, with its quarterly phasing
 * Amounts are plain numbers (no ₹ / commas) so a spreadsheet can add them up.
 */
import { toCsv } from '../../../lib/export/csv.js';
import { BUDGET_STATUS, BUDGET_TYPE, QUARTERS, budgetTypeOf } from '../constants.js';

const typeLabel = (b) => BUDGET_TYPE[budgetTypeOf(b)] || '';
const statusLabel = (b) => BUDGET_STATUS[b.status] || b.status || '';

/** The budget columns both exports start with. */
const BUDGET_FIELDS = [
  { header: 'budget_code', value: (b) => b.budgetCode },
  { header: 'budget_name', value: (b) => b.name },
  { header: 'financial_year', value: (b) => b.financialYear },
  { header: 'budget_type', value: typeLabel },
  { header: 'programme', value: (b) => b.programme || '' },
  { header: 'state', value: (b) => b.stateName || 'All states' },
  { header: 'status', value: statusLabel },
];

export function budgetsCsv(budgets) {
  return toCsv(
    [
      ...BUDGET_FIELDS,
      { header: 'lines', value: (b) => b.lineCount ?? '' },
      { header: 'total', value: (b) => Number(b.total) || 0 },
      { header: 'owner', value: (b) => b.owner || '' },
      { header: 'created_at', value: (b) => b.createdAt || '' },
      { header: 'updated_at', value: (b) => b.updatedAt || '' },
    ],
    budgets,
  );
}

/** One row per line; `budgets` are full budgets (with `lines`), as from the budget detail. */
export function budgetLinesCsv(budgets) {
  const rows = budgets.flatMap((budget) => (budget.lines || []).map((line) => ({ budget, line })));
  return toCsv(
    [
      ...BUDGET_FIELDS.map((f) => ({ header: f.header, value: (r) => f.value(r.budget) })),
      { header: 'line_code', value: (r) => r.line.lineCode },
      { header: 'category', value: (r) => r.line.categoryName || '' },
      { header: 'description', value: (r) => r.line.description || '' },
      { header: 'book', value: (r) => r.line.book || '' },
      ...QUARTERS.map((q) => ({
        header: `${q.key}_${q.months.toLowerCase().replace('–', '_')}`,
        value: (r) => Number(r.line[q.key]) || 0,
      })),
      { header: 'line_total', value: (r) => QUARTERS.reduce((s, q) => s + (Number(r.line[q.key]) || 0), 0) },
    ],
    rows,
  );
}
