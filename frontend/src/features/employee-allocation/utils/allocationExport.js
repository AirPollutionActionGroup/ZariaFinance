/**
 * Employee allocations → CSV: one row per allocation the page shows, with the
 * same status label as on screen, plus each employee's current total — the
 * sum of their running allocations, so over- / under-allocation is visible.
 */
import { toCsv } from '../../../lib/export/csv.js';
import { STATUS_META, allocationStatus } from './allocationStatus.js';

/**
 * @param {Array} rows        allocations to export (as filtered on the page)
 * @param {Array} [all=rows]  every allocation — the per-employee total counts all running ones, not just those shown
 */
export function allocationsCsv(rows, all = rows) {
  const currentTotal = new Map();
  for (const a of all) {
    if (a.active !== false) currentTotal.set(a.employeeId, (currentTotal.get(a.employeeId) || 0) + (Number(a.allocationPct) || 0));
  }
  return toCsv(
    [
      { header: 'emp_code', value: (a) => a.empCode },
      { header: 'employee', value: (a) => a.employeeName },
      { header: 'programme', value: (a) => a.programmeName },
      { header: 'project', value: (a) => a.projectName || '' },
      { header: 'role', value: (a) => a.role || '' },
      { header: 'allocation_pct', value: (a) => a.allocationPct },
      { header: 'status', value: (a) => STATUS_META[allocationStatus(a)]?.label || '' },
      { header: 'start_date', value: (a) => a.startDate || '' },
      { header: 'end_date', value: (a) => a.endDate || '' },
      { header: 'employee_current_total_pct', value: (a) => currentTotal.get(a.employeeId) ?? 0 },
      { header: 'states', value: (a) => (a.stateNames || []).join('; ') },
      { header: 'cities', value: (a) => (a.cityNames || []).join('; ') },
      { header: 'remark', value: (a) => a.remark || '' },
      { header: 'created_at', value: (a) => a.createdAt || '' },
      { header: 'updated_at', value: (a) => a.updatedAt || '' },
    ],
    rows,
  );
}
