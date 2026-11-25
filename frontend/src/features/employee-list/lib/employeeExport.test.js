import { describe, expect, it } from 'vitest';
import { employeesCsv } from './employeeExport.js';

describe('employee export', () => {
  it('one row per employee; CTC as a plain number; states / cities joined', () => {
    const lines = employeesCsv([
      {
        empId: 'EMP-001', name: 'Mehta, Aarav', departmentName: 'Programmes', designationName: 'Field Officer',
        bucket: 'Programme', employmentType: 'Permanent', status: 'On Notice', joiningDate: '2025-04-01',
        annualCtc: '600000.00', pf: 'Yes', esi: 'No', gratuity: 'Yes', stateNames: ['Bihar', 'Assam'], cityNames: ['Patna'],
      },
      { empId: 'EMP-002', name: 'Neha', annualCtc: null },
    ]).split('\r\n');
    expect(lines[0]).toBe(
      'emp_id,name,department,designation,bucket,employment_type,status,joining_date,exit_date,annual_ctc,pf,esi,gratuity,states,cities,remark,created_at,updated_at',
    );
    expect(lines[1]).toBe('EMP-001,"Mehta, Aarav",Programmes,Field Officer,Programme,Permanent,On Notice,2025-04-01,,600000,Yes,No,Yes,Bihar; Assam,Patna,,,');
    expect(lines[2]).toMatch(/^EMP-002,Neha,.*,Active,/);
  });
});
