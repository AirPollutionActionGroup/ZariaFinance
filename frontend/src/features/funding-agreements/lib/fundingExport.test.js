import { describe, expect, it } from 'vitest';
import { fundingCsv, fundingWorkbook } from './fundingExport.js';

const rows = [
  {
    key: 'fp-24', profileCode: 'FP-2026-024', grantCode: 'GA-2026-27-021', legacyCode: 'ZRY/GA/2026/021',
    title: 'Horizon Global Fund · FY 2026-27', donorName: 'Horizon Global Fund', programmeName: '',
    classCode: 'C', startDate: '2026-11-20', endDate: '2027-03-31', hasSchedule: true, committed: 112518,
    currency: 'USD', foreignAmount: 1200, received: 70000, stage: 'approved',
  },
  {
    key: 'fp-22', profileCode: 'FP-2026-022', grantCode: null, title: null, donorName: 'Greenline, "Power" Trust',
    programmeName: 'India Science Festival', classCode: 'A', startDate: null, endDate: null,
    hasSchedule: true, committed: 1000, received: 0, stage: 'terms',
  },
];

describe('funding export', () => {
  it('CSV: one row per record with committed, received, outstanding and stage', () => {
    const [header, r1, r2] = fundingCsv(rows).split('\r\n');
    expect(header).toBe(
      'funding_code,agreement_code,former_agreement_code,agreement,donor,programme,class,start_date,end_date,committed,currency,foreign_amount,received,outstanding,received_pct,stage',
    );
    expect(r1).toBe(
      'FP-2026-024,GA-2026-27-021,ZRY/GA/2026/021,Horizon Global Fund · FY 2026-27,Horizon Global Fund,,C · Fully unrestricted,2026-11-20,2027-03-31,112518,USD,1200,70000,42518,62,Approved',
    );
    expect(r2).toBe('FP-2026-022,,,,"Greenline, ""Power"" Trust",India Science Festival,A · Restricted,,,1000,INR,,0,1000,0,Terms only');
  });

  it('Excel: Summary linked to the Agreements totals; outstanding and collected are formulas', () => {
    const [summary, agreements] = fundingWorkbook(rows, { asAt: new Date('2026-11-25'), filterNote: 'filtered: 2 of 24' });
    expect(agreements).toMatchObject({ autoFilter: 'A4:M6', freezeRows: 4 });
    expect(agreements.rows[4][10]).toMatchObject({ f: 'MAX(0,I5-J5)', v: 42518 });
    expect(agreements.rows[4][11]).toMatchObject({ f: 'IF(I5=0,0,J5/I5)', style: 'pct' });
    expect(agreements.rows[4][12]).toEqual({ v: 'Approved', style: 'ok' });
    expect(agreements.rows[6][8]).toMatchObject({ f: 'SUM(I5:I6)', v: 113518, style: 'totalInr' });
    const find = (label) => summary.rows.find((r) => r?.[0]?.v === label);
    expect(find('Committed')[1]).toMatchObject({ f: 'Agreements!$I$7', v: 113518 });
    expect(find('Foreign committed')[1].v).toBe('USD 1,200');
    expect(summary.rows.some((r) => r?.[0]?.v === 'By donor')).toBe(true);
    expect(summary.rows[1][0].v).toContain('filtered: 2 of 24');
  });
});
