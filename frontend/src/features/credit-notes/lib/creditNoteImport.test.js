import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../../lib/import/csv.js';
import { defaultSelection, errorReportCsv, readImportFile, rowsToCsv, templateCsv } from './creditNoteImport.js';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, commas and line breaks in quotes, CRLF and a BOM', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3\n';
    expect(parseCsv(text)).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'two\nlines'],
      ['1', '2', '3'],
    ]);
  });
});

describe('readImportFile', () => {
  it('reads the template back into rows with line numbers', () => {
    const { rows, error } = readImportFile(templateCsv());
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 2, date: '2026-11-20', book: 'LC', amountInr: '50000', trancheCode: null });
    expect(rows[1]).toMatchObject({ rowNumber: 3, book: 'FC', currency: 'USD', foreignAmount: '1000', fxRate: '88.25' });
  });

  it('accepts headers in any case / with spaces, and ignores unknown columns', () => {
    const { rows, error } = readImportFile('Date,Book,Received Via,Amount INR,Notes\n2026-11-20,lc,NEFT,500,x\n');
    expect(error).toBeNull();
    expect(rows[0]).toMatchObject({ date: '2026-11-20', book: 'lc', receivedVia: 'NEFT', amountInr: '500' });
  });

  it("reads Tally's own column names for the Tally voucher", () => {
    const { rows, error } = readImportFile('Date,Book,Received Via,Vch Type,Vch No.\n2026-11-20,LC,NEFT,Receipt,245\n');
    expect(error).toBeNull();
    expect(rows[0]).toMatchObject({ tallyVoucherType: 'Receipt', tallyVoucherNo: '245' });
    expect(readImportFile('date,book,received_via,Voucher No.\n2026-11-20,LC,NEFT,R/9\n').rows[0].tallyVoucherNo).toBe('R/9');
  });

  it('puts tally_voucher_no and tally_voucher_type first in the template', () => {
    expect(templateCsv().split('\r\n')[0]).toMatch(/^tally_voucher_no,tally_voucher_type,date,book,/);
  });

  it('rejects a file missing a required column, or with no rows', () => {
    expect(readImportFile('date,book\n2026-11-20,LC\n').error).toMatch(/Missing column: received_via/);
    expect(readImportFile('date,book,received_via\n').error).toMatch(/no rows/);
  });
});

describe('selection and error report', () => {
  const results = [
    { rowNumber: 2, status: 'READY' },
    { rowNumber: 3, status: 'WARNING', duplicate: true },
    { rowNumber: 4, status: 'WARNING' },
    { rowNumber: 5, status: 'ERROR', errors: ['date is required', 'book is required (LC or FC)'] },
  ];

  it('ticks valid rows by default, but not possible duplicates or errors', () => {
    expect([...defaultSelection(results)]).toEqual([2, 4]);
  });

  it('lists only the rows with errors, with their values and reasons', () => {
    const csv = errorReportCsv(results, [{ rowNumber: 5, reference: 'UTR-5' }]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^row,tally_voucher_no,tally_voucher_type,date,book,.*,errors$/);
    expect(lines[1]).toContain('UTR-5');
    expect(lines[1]).toContain('date is required; book is required (LC or FC)');
  });
});

describe('rowsToCsv', () => {
  it('writes edited rows back in the template layout, so the file reads back the same', () => {
    const { rows } = readImportFile(templateCsv());
    const edited = rows.map((r) => (r.rowNumber === 2 ? { ...r, reference: 'UTR, fixed' } : r));
    const again = readImportFile(rowsToCsv(edited)).rows;
    expect(again[0].reference).toBe('UTR, fixed');
    expect(again[1]).toEqual(rows[1]);
  });
});
