import { describe, expect, it } from 'vitest';
import { errorReportCsv, readImportFile, rowsToCsv, templateCsv } from './debitNoteImport.js';

describe('debit note import file', () => {
  it('template starts with the Tally columns and reads back into rows', () => {
    expect(templateCsv().split('\r\n')[0]).toMatch(/^tally_voucher_no,tally_voucher_type,date,outflow_line_id,book,amount_inr,reason,/);
    const { rows, error } = readImportFile(templateCsv());
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 2, tallyVoucherNo: '118', outflowLineId: 'BUD-2026-001-BL01-Q3', payeeCode: 'VEN-001', book: null });
    expect(rows[1]).toMatchObject({ reason: 'Additional charge', payeeCategory: 'Employee', payeeCode: 'EMP-001' });
  });

  it('needs the required columns', () => {
    expect(readImportFile('date,amount_inr\n2026-11-20,10\n').error).toMatch(
      /Missing columns: outflow_line_id, payee_category, payee_code, paid_via, payment_group/,
    );
  });

  it("reads Tally's own voucher column names", () => {
    const head = 'Vch No.,Vch Type,date,outflow_line_id,amount_inr,payee_category,payee_code,paid_via,payment_group';
    const { rows } = readImportFile(`${head}\n118,Payment,2026-11-20,BUD-1-BL01-Q1,10,Vendor,VEN-1,NEFT,G\n`);
    expect(rows[0]).toMatchObject({ tallyVoucherNo: '118', tallyVoucherType: 'Payment' });
  });

  it('edited file and error report keep the template layout', () => {
    const { rows } = readImportFile(templateCsv());
    expect(readImportFile(rowsToCsv(rows)).rows).toEqual(rows);
    const report = errorReportCsv([{ rowNumber: 3, status: 'ERROR', errors: ['payee_code X is not a vendor code'] }], rows);
    expect(report.split('\r\n')[0]).toMatch(/^row,tally_voucher_no,.*,errors$/);
    expect(report).toContain('payee_code X is not a vendor code');
  });
});
