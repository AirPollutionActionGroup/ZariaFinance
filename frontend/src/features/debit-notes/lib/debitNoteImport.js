/**
 * Debit note CSV import — its columns and template. Reading, the error report
 * and the edited file come from the shared CSV import helpers.
 */
import * as csvImport from '../../../lib/import/csvImport.js';

/** Template columns, in order, with the request field each one fills. The Tally voucher comes first. */
export const IMPORT_COLUMNS = [
  ...csvImport.TALLY_COLUMNS,
  { header: 'date', field: 'date', required: true, hint: 'YYYY-MM-DD or DD-MM-YYYY' },
  { header: 'outflow_line_id', field: 'outflowLineId', required: true, hint: 'Outflow row, e.g. BUD-2026-001-BL01-Q2' },
  { header: 'book', field: 'book', hint: 'LC or FC — blank uses the outflow line’s book', options: ['LC', 'FC'] },
  { header: 'amount_inr', field: 'amountInr', required: true, hint: 'Amount paid, in ₹' },
  {
    header: 'reason', field: 'reason',
    hint: 'Only when the note takes the line over budget: a reason from Masters → Over-budget reasons, e.g. Additional charge',
  },
  { header: 'payee_category', field: 'payeeCategory', required: true, hint: 'Employee or Vendor', options: ['Employee', 'Vendor'] },
  { header: 'payee_code', field: 'payeeCode', required: true, hint: 'Employee ID (e.g. EMP-001) or vendor code (e.g. VEN-001)' },
  { header: 'paid_via', field: 'paidVia', required: true, hint: 'Payment mode name, e.g. NEFT' },
  { header: 'bank_account', field: 'bankAccount', hint: 'Account number, or its last 4 digits' },
  { header: 'payment_group', field: 'paymentGroup', required: true, hint: 'Payment group name, e.g. Income & Expenditure Heads' },
  { header: 'ledger', field: 'ledger', hint: 'Ledger name under that group' },
  { header: 'reference', field: 'reference', hint: 'Bill no. / UTR / cheque no.' },
  { header: 'donor_code', field: 'donorCode', hint: 'e.g. DNR-CD-005 — to charge a donor fund' },
  { header: 'fund_profile_code', field: 'fundProfileCode', hint: 'e.g. FP-2026-024 — the debit can’t be more than it has available' },
  { header: 'remarks', field: 'remarks', hint: '' },
];

/** The template file: the header row plus two example rows (a vendor bill on a fund, an employee reimbursement). */
export function templateCsv() {
  return csvImport.templateCsv(IMPORT_COLUMNS, [
    {
      tallyVoucherNo: '118', tallyVoucherType: 'Payment', date: '2026-11-20', outflowLineId: 'BUD-2026-001-BL01-Q3',
      amountInr: '25000', payeeCategory: 'Vendor', payeeCode: 'VEN-001', paidVia: 'NEFT', bankAccount: '1412',
      paymentGroup: 'Income & Expenditure Heads', reference: 'BILL-2291', donorCode: 'DNR-CD-001',
      fundProfileCode: 'FP-2026-001', remarks: 'Solar panel installation',
    },
    {
      date: '2026-11-21', outflowLineId: 'BUD-2026-001-BL02-Q3', amountInr: '3200', reason: 'Additional charge',
      payeeCategory: 'Employee', payeeCode: 'EMP-001', paidVia: 'NEFT', paymentGroup: 'Income & Expenditure Heads',
      reference: 'TRAVEL-NOV', remarks: 'Field travel reimbursement',
    },
  ]);
}

export const readImportFile = (text) => csvImport.readImportFile(text, IMPORT_COLUMNS);
export const errorReportCsv = (results, sourceRows) => csvImport.errorReportCsv(IMPORT_COLUMNS, results, sourceRows);
export const rowsToCsv = (rows) => csvImport.rowsToCsv(IMPORT_COLUMNS, rows);
