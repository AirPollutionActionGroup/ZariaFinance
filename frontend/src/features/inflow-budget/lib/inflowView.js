/**
 * An inflow line (grant tranche) from the API → the view row the pages and
 * exports share: status, amounts as numbers, outstanding, year, quarter and
 * days late, all worked out "as at" one moment so every figure agrees.
 */
import { financialYearOf } from '../../budget/lib/financialYear.js';
import { RECEIPT_STATUS } from '../constants.js';
import { getRowStatus } from './status.js';

const DAY = 24 * 60 * 60 * 1000;

/** Indian FY quarter key (q1 = Apr–Jun … q4 = Jan–Mar) for a date string. */
export function quarterOf(date) {
  if (!date) return null;
  const m = new Date(date).getMonth(); // 0 = Jan
  return `q${m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4}`;
}

export function toInflowView(row, asAt) {
  const status = getRowStatus(row, asAt);
  const expected = Number(row.expectedAmount || 0);
  const received = row.actualAmount != null ? Number(row.actualAmount) : 0;
  return {
    ...row,
    status,
    expected,
    received,
    outstanding: Math.max(0, expected - received),
    extra: Math.max(0, received - expected),
    fy: row.expectedDate ? financialYearOf(new Date(row.expectedDate)) : '',
    quarter: quarterOf(row.expectedDate),
    daysLate:
      status === RECEIPT_STATUS.RECEIVED || !row.expectedDate
        ? 0
        : Math.max(0, Math.floor((asAt - new Date(row.expectedDate)) / DAY)),
  };
}
