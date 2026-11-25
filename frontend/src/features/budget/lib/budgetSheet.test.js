import { describe, expect, it } from 'vitest';
import { budgetLinesSheetCsv, budgetSheetHtml, budgetWorkbook } from './budgetSheet.js';

const budget = {
  budgetCode: 'BUD-2026-005',
  name: 'Clean air <phase 1>',
  financialYear: '2026-27',
  budgetType: 'PROGRAMME',
  programme: 'Clean Air Action Programme',
  stateName: '',
  owner: 'Asha',
  status: 'APPROVED',
  lines: [
    { lineCode: 'BL-01', category: 1, categoryName: 'Personnel', description: 'Field staff', book: 'LC', q1: 10000, q2: 20000, q3: 0, q4: 0 },
    { lineCode: 'BL-02', category: 2, categoryName: 'Travel', description: 'Site visits', book: 'FC', q1: 0, q2: 5000, q3: 15000, q4: 0 },
  ],
  history: [
    { status: 'DRAFT', at: '2026-10-08T06:06:36', by: 'Asha', note: 'Created' },
    { status: 'APPROVED', at: '2026-10-09T10:00:00', by: 'Ravi', note: '' },
  ],
};

const find = (rows, label) => rows.find((r) => r?.[0]?.v === label);

describe('budget workbook', () => {
  it('has a Summary dashboard, Lines and Approval history', () => {
    const sheets = budgetWorkbook(budget);
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Lines', 'Approval history']);
    expect(sheets[0]).toMatchObject({ gridLines: false, tabColor: 'F7EB22' });
  });

  it('lines: title, filterable header on row 4, SUM formulas, share and a styled total row', () => {
    const lines = budgetWorkbook(budget)[1];
    expect(lines).toMatchObject({ freezeRows: 4, autoFilter: 'A4:J6', landscape: true, fitToWidth: true });
    expect(lines.rows[3].map((c) => c.v)).toEqual(['Line', 'Category', 'Description', 'Book', 'Q1 · Apr–Jun', 'Q2 · Jul–Sep', 'Q3 · Oct–Dec', 'Q4 · Jan–Mar', 'Total', 'Share']);
    expect(lines.rows[4][8]).toMatchObject({ f: 'SUM(E5:H5)', v: 30000 });
    expect(lines.rows[4][9]).toMatchObject({ f: 'IF($I$7=0,0,I5/$I$7)', v: 0.6, style: 'pct' });
    expect(lines.rows[6][0]).toMatchObject({ v: 'Total · 2 lines', style: 'totalLabel' });
    expect(lines.rows[6][8]).toMatchObject({ f: 'SUM(I5:I6)', v: 50000, style: 'totalInr' });
  });

  it('summary: status coloured, total linked to Lines, breakdowns with shares and in-cell bars', () => {
    const rows = budgetWorkbook(budget)[0].rows;
    expect(find(rows, 'Status')[1]).toEqual({ v: 'Approved', style: 'ok' });
    expect(find(rows, 'Total budget')[1]).toMatchObject({ f: 'Lines!$I$7', v: 50000, style: 'bigInr' });
    expect(find(rows, 'Approved on')[1].v).toMatch(/2026/);
    const q2 = find(rows, 'Q2');
    expect(q2[2]).toMatchObject({ f: 'Lines!F7', v: 25000 });
    expect(q2[3]).toMatchObject({ v: 0.5, style: 'pct' });
    expect(q2[4]).toMatchObject({ f: expect.stringMatching(/^REPT\("█",ROUND\(D\d+\*20,0\)\)$/), v: '█'.repeat(10), style: 'bar' });
    expect(find(rows, 'Personnel')[3].v).toBe(0.6);
    expect(find(rows, 'FC')[1].v).toBe('FC · Foreign contribution');
  });
});

describe('budget lines CSV', () => {
  it('readable headers, share of budget and a total row', () => {
    const lines = budgetLinesSheetCsv(budget).split('\r\n');
    expect(lines[0]).toBe(
      'Budget code,Budget,Financial year,Line,Category,Description,Book,Q1 (Apr–Jun),Q2 (Jul–Sep),Q3 (Oct–Dec),Q4 (Jan–Mar),Line total,Share of budget',
    );
    expect(lines[1]).toBe('BUD-2026-005,Clean air <phase 1>,FY 2026-27,BL-01,Personnel,Field staff,LC,10000,20000,0,0,30000,60%');
    expect(lines[3]).toBe('BUD-2026-005,Clean air <phase 1>,FY 2026-27,Total,,2 lines,,10000,25000,15000,0,50000,100%');
  });
});

describe('budget sheet (PDF)', () => {
  it('a full page with every section, coloured status, and escaped text', () => {
    const html = budgetSheetHtml(budget, { printedBy: 'Review Mode', printedAt: new Date('2026-11-24') });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('Clean air &lt;phase 1&gt;');
    expect(html).not.toContain('<phase 1>');
    for (const text of ['Zariya · Budget sheet', 'Total budget', 'Quarterly phasing', 'By category', 'By book', 'Budget lines · 2', 'Approval history', 'Prepared by', 'Approved by', 'counter(pages)']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('color: #1E6B4A; background: #E7F1EB'); // Approved → green chip
    expect(html).toContain('₹50,000');
    expect(html).toContain('60% · 40%'); // LC · FC split
    expect(html).toContain('width:50%'); // Q2 bar
  });
});
