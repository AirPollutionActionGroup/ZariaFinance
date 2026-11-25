import { describe, expect, it } from 'vitest';
import { inflowReceiptsCsv, inflowTranchesCsv } from './inflowExport.js';

const tranche = {
  id: '831',
  trancheCode: 'FP-2026-024-T1',
  profileCode: 'FP-2026-024',
  line: 'Grant tranche — Horizon Global Fund',
  donor: 'Horizon, "Global" Fund',
  fundingSource: 'UNRESTRICTED',
  book: 'FC',
  fy: '2026-27',
  quarter: 'q3',
  expectedDate: '2026-11-21',
  expected: 65635.5,
  received: 70000,
  outstanding: 0,
  actualDate: '2026-11-20',
  status: 'Received',
  daysLate: 0,
  fcraApplicable: true,
  foreign: { currency: 'USD', expectedForeignAmount: 700, fxRate: 93.765 },
  receipts: [{ creditNoteId: 'CN-2026-007', date: '2026-11-20', reference: '001234567', amount: 70000 }],
};
const unpaid = { ...tranche, id: '1', trancheCode: 'FP-2026-001-T1', book: 'LC', foreign: null, receipts: [], received: 0, outstanding: 10000, expected: 10000, status: 'Overdue', daysLate: 58, fcraApplicable: false };

describe('inflow export', () => {
  it('one row per tranche with expected, received, foreign side and status', () => {
    const [header, row, row2] = inflowTranchesCsv([tranche, unpaid]).split('\r\n');
    expect(header).toBe(
      'tranche_code,funding_record,description,donor,funding_source,book,book_name,financial_year,quarter,expected_date,expected_amount,currency,expected_foreign_amount,fx_rate,received_amount,outstanding,received_pct,last_received_date,receipts,status,days_late,fcra_applicable',
    );
    expect(row).toBe(
      'FP-2026-024-T1,FP-2026-024,Grant tranche — Horizon Global Fund,"Horizon, ""Global"" Fund",Unrestricted,FC,Foreign contribution,FY 2026-27,Q3,2026-11-21,65635.5,USD,700,93.765,70000,0,107,2026-11-20,1,Received,0,Yes',
    );
    expect(row2).toMatch(/^FP-2026-001-T1,.*,10000,INR,,,0,10000,0,2026-11-20,0,Overdue,58,No$/);
  });

  it('one row per receipt; UTR kept as text; unpaid tranches skipped', () => {
    const lines = inflowReceiptsCsv([tranche, unpaid]).split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0].endsWith('instalment,credit_note,received_date,receipt_ref_utr,amount')).toBe(true);
    expect(lines[1].endsWith('1,CN-2026-007,2026-11-20,"=""001234567""",70000')).toBe(true);
  });
});
