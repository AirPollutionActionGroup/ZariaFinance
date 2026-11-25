/**
 * Outflow schedule → CSV: one row per approved budget line per quarter, with
 * budgeted, spent (debit notes) and remaining. Amounts are plain numbers.
 */
import { toCsv } from '../../../lib/export/csv.js';
import { BOOK } from '../../../shared/constants/book.js';
import { BUDGET_TYPE } from '../../budget/constants.js';
import { PAYMENT_STATUS } from '../constants.js';

const DAY = 24 * 60 * 60 * 1000;

/** Days past the due date for a row still waiting on spend (0 otherwise), as at `asAt`. */
export function daysLateAt(row, asAt) {
  if (!row.expectedDate || (row.status !== 'OVERDUE' && row.status !== 'PENDING')) return 0;
  return Math.max(0, Math.floor((asAt - new Date(row.expectedDate).getTime()) / DAY));
}

export function outflowRowsCsv(rows, asAt = Date.now()) {
  return toCsv(
    [
      { header: 'row_id', value: (r) => r.id },
      { header: 'budget_code', value: (r) => r.budgetCode },
      { header: 'budget_name', value: (r) => r.budgetName || '' },
      { header: 'financial_year', value: (r) => (r.financialYear ? `FY ${r.financialYear}` : '') },
      { header: 'budget_type', value: (r) => BUDGET_TYPE[r.budgetType] || r.budgetType || '' },
      { header: 'scope', value: (r) => r.scope || '' },
      { header: 'state', value: (r) => r.stateName || 'All states' },
      { header: 'line_code', value: (r) => r.lineCode },
      { header: 'line', value: (r) => r.line || '' },
      { header: 'category', value: (r) => r.categoryName || '' },
      { header: 'book', value: (r) => r.book || '' },
      { header: 'book_name', value: (r) => BOOK[r.book] || '' },
      { header: 'quarter', value: (r) => (r.quarter ? `Q${r.quarter}` : '') },
      { header: 'due_date', value: (r) => r.expectedDate || '' },
      { header: 'budgeted', value: (r) => Number(r.expectedAmount) || 0 },
      { header: 'spent', value: (r) => Number(r.spent) || 0 },
      { header: 'remaining', value: (r) => Number(r.remaining) || 0 },
      { header: 'spent_pct', value: (r) => (r.expectedAmount > 0 ? Math.round((r.spent / r.expectedAmount) * 100) : 0) },
      { header: 'status', value: (r) => PAYMENT_STATUS[r.status] || r.status || '' },
      { header: 'days_late', value: (r) => daysLateAt(r, asAt) },
    ],
    rows,
  );
}
