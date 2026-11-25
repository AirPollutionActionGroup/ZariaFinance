import { describe, expect, it } from 'vitest';
import { programmeRows, programmesCsv } from './programmeExport.js';

const data = [
  { id: 1, programmeCode: 'PROG-001', programmeName: 'Health', type: 'Programme', status: 'Active', stateNames: ['Kerala', 'Goa'], cityNames: [] },
  { id: 2, programmeCode: 'PROG-002', programmeName: 'Education', type: 'Programme', status: 'On Hold', stateNames: [], cityNames: [] },
  { id: 10, programmeCode: 'PRJ-001', programmeName: 'School meals', type: 'Project', parentProgrammeId: 2, parentProgrammeName: 'Education', status: 'Active', startDate: '2026-04-01', stateNames: [], cityNames: ['Pune'] },
  { id: 11, programmeCode: 'PRJ-002', programmeName: 'Clinics, rural', type: 'Project', parentProgrammeId: 1, parentProgrammeName: 'Health', status: 'Closed', stateNames: [], cityNames: [] },
];

describe('programme export', () => {
  it('tree order with S.No, projects under their programme', () => {
    expect(programmeRows(data).map((r) => `${r.srNo} ${r.programmeCode}`)).toEqual([
      '1 PROG-001', '1.1 PRJ-002', '2 PROG-002', '2.1 PRJ-001',
    ]);
  });

  it('follows the list filters', () => {
    expect(programmeRows(data, { type: 'programme' }).map((r) => r.programmeCode)).toEqual(['PROG-001', 'PROG-002']);
    expect(programmeRows(data, { status: 'Active' }).map((r) => r.programmeCode)).toEqual(['PROG-001', 'PROG-002', 'PRJ-001']);
    expect(programmeRows(data, { search: 'meals' }).map((r) => r.programmeCode)).toEqual(['PROG-002', 'PRJ-001']);
  });

  it('writes the columns, joining states / cities', () => {
    const lines = programmesCsv(programmeRows(data)).split('\r\n');
    expect(lines[0]).toBe('s_no,type,programme_code,programme_name,parent_programme_code,parent_programme,projects,status,start_date,end_date,states,cities,description');
    expect(lines[1]).toBe('1,Programme,PROG-001,Health,,,1,Active,,,Kerala; Goa,,');
    expect(lines[2]).toBe('1.1,Project,PRJ-002,"Clinics, rural",PROG-001,Health,,Closed,,,,,');
  });
});
