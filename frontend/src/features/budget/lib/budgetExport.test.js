import { describe, expect, it } from 'vitest';
import { budgetLinesCsv, budgetsCsv } from './budgetExport.js';

const budget = {
  id: 1,
  budgetCode: 'BUD-2026-001',
  name: 'Clean air, phase 1',
  financialYear: '2026-27',
  budgetType: 'PROGRAMME',
  programme: 'Clean Air Action Programme',
  stateName: '',
  status: 'APPROVED',
  owner: 'Asha',
  total: 110500,
  lineCount: 2,
  lines: [
    { lineCode: 'BL-01', categoryName: 'Personnel', description: 'Field staff', book: 'LC', q1: 10000, q2: 20000, q3: 30000, q4: 50000 },
    { lineCode: 'BL-02', categoryName: 'Travel', description: 'Site visits', book: 'FC', q1: 500, q2: 0, q3: null, q4: 0 },
  ],
};

describe('budget export', () => {
  it('one row per budget, with type / status labels and a plain total', () => {
    const lines = budgetsCsv([budget]).split('\r\n');
    expect(lines[0]).toBe('budget_code,budget_name,financial_year,budget_type,programme,state,status,lines,total,owner,created_at,updated_at');
    expect(lines[1]).toMatch(/^BUD-2026-001,"Clean air, phase 1",2026-27,Programme-based,Clean Air Action Programme,All states,Approved,2,110500,Asha,,$/);
  });

  it('one row per line, with quarters and the line total', () => {
    const lines = budgetLinesCsv([budget]).split('\r\n');
    expect(lines[0]).toBe(
      'budget_code,budget_name,financial_year,budget_type,programme,state,status,line_code,category,description,book,q1_apr_jun,q2_jul_sep,q3_oct_dec,q4_jan_mar,line_total',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/,BL-01,Personnel,Field staff,LC,10000,20000,30000,50000,110000$/);
    expect(lines[2]).toMatch(/,BL-02,Travel,Site visits,FC,500,0,0,0,500$/);
  });
});
