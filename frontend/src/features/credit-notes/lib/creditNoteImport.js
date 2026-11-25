/**
 * Credit note CSV import — its columns and template. Reading, the error report
 * and the edited file come from the shared CSV import helpers.
 */
import * as csvImport from '../../../lib/import/csvImport.js';

export { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, defaultSelection } from '../../../lib/import/csvImport.js';

/** Template columns, in order, with the request field each one fills. The Tally voucher comes first. */
export const IMPORT_COLUMNS = [
  ...csvImport.TALLY_COLUMNS,
  { header: 'date', field: 'date', required: true, hint: 'YYYY-MM-DD or DD-MM-YYYY' },
  { header: 'book', field: 'book', required: true, hint: 'LC or FC', options: ['LC', 'FC'] },
  { header: 'amount_inr', field: 'amountInr', hint: 'Required for LC; worked out for an FC fund' },
  { header: 'received_via', field: 'receivedVia', required: true, hint: 'Payment mode name, e.g. NEFT' },
  { header: 'bank_account', field: 'bankAccount', hint: 'Account number, or its last 4 digits' },
  { header: 'reference', field: 'reference', hint: 'UTR / SWIFT / cheque no.' },
  { header: 'donor_code', field: 'donorCode', hint: 'e.g. DNR-CD-005' },
  { header: 'fund_profile_code', field: 'fundProfileCode', hint: 'e.g. FP-2026-024 — required with a donor' },
  { header: 'tranche_code', field: 'trancheCode', hint: 'e.g. FP-2026-024-T1 — for a fund paid in tranches' },
  { header: 'currency', field: 'currency', hint: 'FC fund only, e.g. USD' },
  { header: 'foreign_amount', field: 'foreignAmount', hint: 'FC fund only' },
  { header: 'fx_rate', field: 'fxRate', hint: 'FC fund only — ₹ per unit, as the bank converted' },
  { header: 'remarks', field: 'remarks', hint: '' },
];

/** The template file: the header row plus two example rows (one LC lump sum, one FC tranche). */
export function templateCsv() {
  return csvImport.templateCsv(IMPORT_COLUMNS, [
    {
      date: '2026-11-20', book: 'LC', amountInr: '50000', receivedVia: 'NEFT', bankAccount: '1412',
      reference: 'UTR123456', tallyVoucherType: 'Receipt', tallyVoucherNo: '245', donorCode: 'DNR-CD-001',
      fundProfileCode: 'FP-2026-001', remarks: 'Refund of advance',
    },
    {
      date: '2026-11-20', book: 'FC', receivedVia: 'NEFT', reference: 'SWIFT98765', donorCode: 'DNR-CD-005',
      fundProfileCode: 'FP-2026-024', trancheCode: 'FP-2026-024-T1', currency: 'USD', foreignAmount: '1000', fxRate: '88.25',
    },
  ]);
}

export const readImportFile = (text) => csvImport.readImportFile(text, IMPORT_COLUMNS);
export const errorReportCsv = (results, sourceRows) => csvImport.errorReportCsv(IMPORT_COLUMNS, results, sourceRows);
export const rowsToCsv = (rows) => csvImport.rowsToCsv(IMPORT_COLUMNS, rows);
