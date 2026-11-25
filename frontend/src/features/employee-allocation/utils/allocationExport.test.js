import { describe, expect, it } from 'vitest';
import { allocationsCsv } from './allocationExport.js';

const all = [
  { id: 1, employeeId: 7, empCode: 'EMP-001', employeeName: 'Aarav Mehta', programmeName: 'Health', role: 'Lead', allocationPct: 60, active: true },
  { id: 2, employeeId: 7, empCode: 'EMP-001', employeeName: 'Aarav Mehta', programmeName: 'Education', projectName: 'Meals, rural', allocationPct: 30, active: true, stateNames: ['Bihar', 'Assam'] },
  { id: 3, employeeId: 7, empCode: 'EMP-001', employeeName: 'Aarav Mehta', programmeName: 'Water', allocationPct: 80, active: false, endDate: '2026-01-31', remark: 'moved' },
];

describe('allocation export', () => {
  it('one row per allocation, status as on screen, employee total over running allocations', () => {
    const lines = allocationsCsv([all[1], all[2]], all).split('\r\n');
    expect(lines[0]).toBe(
      'emp_code,employee,programme,project,role,allocation_pct,status,start_date,end_date,employee_current_total_pct,states,cities,remark,created_at,updated_at',
    );
    // Total counts the running Health allocation too, even though it isn't exported here.
    expect(lines[1]).toBe('EMP-001,Aarav Mehta,Education,"Meals, rural",,30,Running,,,90,Bihar; Assam,,,,');
    expect(lines[2]).toBe('EMP-001,Aarav Mehta,Water,,,80,Ended,,2026-01-31,90,,,moved,,');
  });
});
