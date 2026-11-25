import { describe, expect, it } from 'vitest';
import { daysLateAt, outflowRowsCsv } from './outflowExport.js';

const row = {
  id: 'BUD-2026-001-BL01-Q1',
  budgetCode: 'BUD-2026-001',
  budgetName: 'pro Budget',
  financialYear: '2026-27',
  budgetType: 'PROGRAMME',
  scope: 'New Eduction',
  stateName: 'Bihar',
  lineCode: 'BL-01',
  line: 'expend personnel',
  categoryName: 'Personnel',
  book: 'LC',
  quarter: 1,
  expectedDate: '2026-06-30',
  expectedAmount: 10000,
  spent: 5000,
  remaining: 5000,
  status: 'OVERDUE',
};
const asAt = new Date('2026-11-24T12:00:00').getTime();

describe('outflow export', () => {
  it('days late only for rows still waiting on spend', () => {
    expect(daysLateAt(row, asAt)).toBe(147);
    expect(daysLateAt({ ...row, status: 'PAID' }, asAt)).toBe(0);
    expect(daysLateAt({ ...row, status: 'DUE' }, asAt)).toBe(0);
  });

  it('one row per quarter row with budgeted, spent, remaining and status', () => {
    const [header, line] = outflowRowsCsv([row], asAt).split('\r\n');
    expect(header).toBe(
      'row_id,budget_code,budget_name,financial_year,budget_type,scope,state,line_code,line,category,book,book_name,quarter,due_date,budgeted,spent,remaining,spent_pct,status,days_late',
    );
    expect(line).toBe(
      'BUD-2026-001-BL01-Q1,BUD-2026-001,pro Budget,FY 2026-27,Programme-based,New Eduction,Bihar,BL-01,expend personnel,Personnel,LC,Local contribution,Q1,2026-06-30,10000,5000,5000,50,Overdue,147',
    );
  });
});
