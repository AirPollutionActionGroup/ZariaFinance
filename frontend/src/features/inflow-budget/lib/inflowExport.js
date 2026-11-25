/**
 * Inflow schedule → CSV, two ways:
 *  - inflowTranchesCsv: one row per grant tranche (expected vs received, status)
 *  - inflowReceiptsCsv: one row per receipt (credit note) against a tranche
 * Rows are the page's view rows (status, quarter, days late already worked out).
 * Amounts are plain numbers (no ₹ / commas) so a spreadsheet can add them up.
 */
import { toCsv } from '../../../lib/export/csv.js';
import { BOOK } from '../../../shared/constants/book.js';
import { QUARTERS } from '../../budget/constants.js';
import { FUNDING_SOURCE_TYPE } from '../constants.js';

const quarterLabel = (key) => QUARTERS.find((q) => q.key === key)?.label || '';

/** The tranche columns both exports start with. */
const TRANCHE_FIELDS = [
  { header: 'tranche_code', value: (r) => r.trancheCode || r.id },
  { header: 'funding_record', value: (r) => r.profileCode || '' },
  { header: 'description', value: (r) => r.line || '' },
  { header: 'donor', value: (r) => r.donor || '' },
  { header: 'funding_source', value: (r) => FUNDING_SOURCE_TYPE[r.fundingSource] || r.fundingSource || '' },
  { header: 'book', value: (r) => r.book || '' },
  { header: 'book_name', value: (r) => BOOK[r.book] || '' },
  { header: 'financial_year', value: (r) => (r.fy ? `FY ${r.fy}` : '') },
  { header: 'quarter', value: (r) => quarterLabel(r.quarter) },
  { header: 'expected_date', value: (r) => r.expectedDate || '' },
];

export function inflowTranchesCsv(rows) {
  return toCsv(
    [
      ...TRANCHE_FIELDS,
      { header: 'expected_amount', value: (r) => Number(r.expected) || 0 },
      { header: 'currency', value: (r) => r.foreign?.currency || 'INR' },
      { header: 'expected_foreign_amount', value: (r) => (r.foreign?.expectedForeignAmount != null ? Number(r.foreign.expectedForeignAmount) : '') },
      { header: 'fx_rate', value: (r) => (r.foreign?.fxRate != null ? Number(r.foreign.fxRate) : '') },
      { header: 'received_amount', value: (r) => Number(r.received) || 0 },
      { header: 'outstanding', value: (r) => Number(r.outstanding) || 0 },
      { header: 'received_pct', value: (r) => (r.expected > 0 ? Math.round((r.received / r.expected) * 100) : 0) },
      { header: 'last_received_date', value: (r) => r.actualDate || '' },
      { header: 'receipts', value: (r) => (r.receipts || []).length },
      { header: 'status', value: (r) => r.status || '' },
      { header: 'days_late', value: (r) => r.daysLate || 0 },
      { header: 'fcra_applicable', value: (r) => (r.fcraApplicable ? 'Yes' : 'No') },
    ],
    rows,
  );
}

/** One row per receipt; tranches with nothing received yet don't appear. */
export function inflowReceiptsCsv(rows) {
  const receipts = rows.flatMap((tranche) => (tranche.receipts || []).map((receipt, i) => ({ tranche, receipt, n: i + 1 })));
  return toCsv(
    [
      ...TRANCHE_FIELDS.map((f) => ({ header: f.header, value: (x) => f.value(x.tranche) })),
      { header: 'instalment', value: (x) => x.n },
      { header: 'credit_note', value: (x) => x.receipt.creditNoteId || '' },
      { header: 'received_date', value: (x) => x.receipt.date || '' },
      { header: 'receipt_ref_utr', value: (x) => x.receipt.reference || '', asText: true },
      { header: 'amount', value: (x) => Number(x.receipt.amount) || 0 },
    ],
    receipts,
  );
}
