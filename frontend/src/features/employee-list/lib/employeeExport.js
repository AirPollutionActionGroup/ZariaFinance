/** Employee Master → CSV: the employees the list shows, one row each. */
import { toCsv } from '../../../lib/export/csv.js';

export function employeesCsv(employees) {
  return toCsv(
    [
      { header: 'emp_id', value: (e) => e.empId },
      { header: 'name', value: (e) => e.name },
      { header: 'department', value: (e) => e.departmentName },
      { header: 'designation', value: (e) => e.designationName },
      { header: 'bucket', value: (e) => e.bucket },
      { header: 'employment_type', value: (e) => e.employmentType },
      { header: 'status', value: (e) => e.status || 'Active' },
      { header: 'joining_date', value: (e) => e.joiningDate || '' },
      { header: 'exit_date', value: (e) => e.exitDate || '' },
      // Plain number (no ₹ / commas) so a spreadsheet can add it up.
      { header: 'annual_ctc', value: (e) => (e.annualCtc == null ? '' : Number(e.annualCtc)) },
      { header: 'pf', value: (e) => e.pf },
      { header: 'esi', value: (e) => e.esi },
      { header: 'gratuity', value: (e) => e.gratuity },
      { header: 'states', value: (e) => (e.stateNames || []).join('; ') },
      { header: 'cities', value: (e) => (e.cityNames || []).join('; ') },
      { header: 'remark', value: (e) => e.remark || '' },
      { header: 'created_at', value: (e) => e.createdAt || '' },
      { header: 'updated_at', value: (e) => e.updatedAt || '' },
    ],
    employees,
  );
}
