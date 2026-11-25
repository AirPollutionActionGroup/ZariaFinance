import { describe, expect, it } from 'vitest';
import { toInflowView } from './inflowView.js';
import { scheduleSheetHtml, scheduleWorkbook, trancheSheetHtml, trancheWorkbook } from './inflowSheet.js';

const asAt = new Date('2026-11-25T10:00:00');
const fcLine = {
  id: 831,
  trancheCode: 'FP-2026-024-T1',
  profileCode: 'FP-2026-024',
  line: 'Grant tranche — Horizon <Global> Fund',
  donor: 'Horizon Global Fund',
  fundingSource: 'UNRESTRICTED',
  book: 'FC',
  fcraApplicable: true,
  expectedDate: '2026-11-21',
  expectedAmount: 65635.5,
  actualDate: '2026-11-20',
  actualAmount: 70000,
  foreign: { currency: 'USD', expectedForeignAmount: 700, fxRate: 93.765, commitmentForeignAmount: 1200, commitmentInrAmount: 112518 },
  receipts: [{ creditNoteId: 'CN-2026-007', date: '2026-11-20', reference: '1234567', amount: 70000 }],
};
const overdueLine = {
  id: 1,
  trancheCode: 'FP-2026-001-T1',
  line: 'Final tranche — Clean Air',
  donor: 'Greenline Power CSR Trust',
  fundingSource: 'RESTRICTED',
  book: 'LC',
  expectedDate: '2026-09-27',
  expectedAmount: 10000,
  actualAmount: null,
  receipts: [],
};
const fc = toInflowView(fcLine, asAt);
const overdue = toInflowView(overdueLine, asAt);

describe('inflow view row', () => {
  it('works out status, outstanding, extra, year, quarter and days late', () => {
    expect(fc).toMatchObject({ status: 'Received', expected: 65635.5, received: 70000, outstanding: 0, extra: 4364.5, fy: '2026-27', quarter: 'q3', daysLate: 0 });
    expect(overdue).toMatchObject({ status: 'Overdue', received: 0, outstanding: 10000, extra: 0, quarter: 'q2', daysLate: 59 });
  });
});

describe('tranche workbook', () => {
  it('Summary links to the Receipts total; outstanding and collected are formulas', () => {
    const [summary, receipts] = trancheWorkbook(fc);
    expect(summary.name).toBe('Summary');
    const find = (label) => summary.rows.find((r) => r?.[0]?.v === label);
    expect(find('Status')[1]).toEqual({ v: 'Received', style: 'ok' });
    expect(find('Received')[1]).toMatchObject({ f: 'Receipts!$E$6', v: 70000 });
    expect(find('Outstanding')[1].f).toMatch(/^MAX\(0,B\d+-B\d+\)$/);
    expect(find('Received extra')[1]).toMatchObject({ v: 4364.5 });
    expect(find('Expected in USD')[1].v).toContain('700');
    expect(receipts.rows[4].map((c) => c.v)).toEqual([1, 'CN-2026-007', '20 Nov 2026', '1234567', 70000]);
    expect(receipts.rows[5][4]).toMatchObject({ f: 'SUM(E5:E5)', v: 70000, style: 'totalInr' });
  });

  it('a tranche with no receipts still builds, with Received = 0', () => {
    const [summary, receipts] = trancheWorkbook(overdue);
    expect(summary.rows.find((r) => r?.[0]?.v === 'Received')[1]).toMatchObject({ f: '0', v: 0 });
    expect(receipts.autoFilter).toBeUndefined();
  });
});

describe('schedule workbook', () => {
  it('Summary, Tranches (formulas + total) and Receipts', () => {
    const sheets = scheduleWorkbook([overdue, fc], { fyLabel: 'FY 2026-27', asAt });
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Tranches', 'Receipts']);
    const tranches = sheets[1];
    expect(tranches.autoFilter).toBe('A4:N6');
    expect(tranches.rows[4][9]).toMatchObject({ f: 'MAX(0,H5-I5)', v: 10000 });
    expect(tranches.rows[4][12]).toEqual({ v: 'Overdue', style: 'err' });
    expect(tranches.rows[6][7]).toMatchObject({ f: 'SUM(H5:H6)', v: 75635.5 });
    const summary = sheets[0].rows;
    expect(summary.find((r) => r?.[0]?.v === 'Expected')[1]).toMatchObject({ f: 'Tranches!$H$7' });
    expect(summary.some((r) => r?.[0]?.v === 'By donor')).toBe(true);
    expect(sheets[2].rows[4].map((c) => c.v)).toEqual(['FP-2026-024-T1', 'Horizon Global Fund', 1, 'CN-2026-007', '20 Nov 2026', '1234567', 70000]);
  });
});

describe('printable sheets', () => {
  it('tranche sheet: escaped title, status chip, FX section and receipts', () => {
    const html = trancheSheetHtml(fc, { printedBy: 'Review Mode', printedAt: asAt });
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('Horizon &lt;Global&gt; Fund');
    expect(html).not.toContain('<Global>');
    for (const t of ['Inflow tranche', 'Received extra', 'Foreign contribution', 'Receipts · 1', 'CN-2026-007', 'Verified by', 'counter(pages)']) {
      expect(html).toContain(t);
    }
    expect(html).toContain('color:#1E6B4A;background:#E7F1EB'); // Received → green chip
  });

  it('schedule sheet: landscape, totals, overdue in red, filter note', () => {
    const html = scheduleSheetHtml([overdue, fc], { fyLabel: 'FY 2026-27', filterNote: 'filtered: 2 of 13 tranches', printedAt: asAt });
    expect(html).toContain('size: A4 landscape');
    expect(html).toContain('filtered: 2 of 13 tranches');
    expect(html).toContain('₹75,635.5');
    expect(html).toContain('59 days late');
    expect(html).toContain('color:#B3372B;background:#F8E9E6'); // Overdue → red chip
  });
});
