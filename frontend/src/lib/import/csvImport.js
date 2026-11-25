/**
 * Shared pieces of a CSV import (credit notes, debit notes, donors): reading a
 * file into rows the API takes, the template, the error report and the edited
 * file. Each import passes its own column list:
 *   { header, field, required?, hint, aliases?, options? }
 * Pure functions (no React), so they're testable.
 */
import { normaliseHeader, parseCsv } from './csv.js';
import { toCsv } from '../export/csv.js';

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1024 * 1024;

/** '=x → =x, '+x → +x …: undo the export's formula guard (lib/export/csv.js); anything else unchanged. */
const unguard = (text) => (/^'[=@+\-\t\r]/.test(text) ? text.slice(1) : text);

const asCsv = (columns, rows) => toCsv(columns.map((c) => ({ header: c.header, value: (r) => r[c.field] ?? '' })), rows);

/** The template: the header row plus example rows. */
export function templateCsv(columns, examples) {
  return asCsv(columns, examples);
}

/**
 * CSV text → { rows, error }. Each row carries its line number in the file
 * (header = 1) so messages point at the right line. Headers match in any case,
 * with spaces or dots ("Vch No." → vch_no), and a column's aliases count too.
 * Unknown columns are ignored; a file missing a required column is rejected.
 */
export function readImportFile(text, columns) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'The file has no rows below the header.' };

  const headers = table[0].map((h) => normaliseHeader(h).replace(/\./g, ''));
  const columnAt = (c) => [c.header, ...(c.aliases || [])].map((name) => headers.indexOf(name)).find((i) => i >= 0) ?? -1;
  const missing = columns.filter((c) => c.required && columnAt(c) < 0).map((c) => c.header);
  if (missing.length) {
    return { rows: [], error: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Start from the template.` };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return { rows: [], error: `The file has ${table.length - 1} rows — the limit is ${MAX_IMPORT_ROWS}. Split it into smaller files.` };
  }

  const index = Object.fromEntries(columns.map((c) => [c.field, columnAt(c)]));
  const rows = table.slice(1).map((cells, i) => {
    const row = { rowNumber: i + 2 };
    for (const c of columns) {
      const at = index[c.field];
      // A leading ' is the export's formula guard — drop it again.
      const value = unguard(at >= 0 ? (cells[at] ?? '').trim() : '');
      row[c.field] = value === '' ? null : value;
    }
    return row;
  });
  return { rows, error: null };
}

/** The rows that couldn't be imported, with their reasons — to fix and upload again. */
export function errorReportCsv(columns, results, sourceRows) {
  const byNumber = new Map(sourceRows.map((r) => [r.rowNumber, r]));
  const failed = results.filter((r) => r.status === 'ERROR');
  return toCsv(
    [
      { header: 'row', value: (r) => r.rowNumber },
      ...columns.map((c) => ({ header: c.header, value: (r) => byNumber.get(r.rowNumber)?.[c.field] ?? '' })),
      { header: 'errors', value: (r) => (r.errors || []).join('; ') },
    ],
    failed,
  );
}

/** All rows (with any edits made on the page) back in the template's column layout. */
export function rowsToCsv(columns, rows) {
  return asCsv(columns, rows);
}

/** Rows that are importable and should be ticked by default: everything valid except possible duplicates. */
export function defaultSelection(results) {
  return new Set(results.filter((r) => r.status !== 'ERROR' && !r.duplicate).map((r) => r.rowNumber));
}

/** The Tally voucher columns both note imports start with. */
export const TALLY_COLUMNS = [
  {
    header: 'tally_voucher_no', field: 'tallyVoucherNo', hint: 'Tally\'s "Vch No." — each voucher is imported once',
    aliases: ['vch_no', 'voucher_no', 'voucher_number', 'tally_id', 'tally_voucher_number'],
  },
  {
    header: 'tally_voucher_type', field: 'tallyVoucherType', hint: 'e.g. Receipt — Tally\'s "Vch Type"',
    aliases: ['vch_type', 'voucher_type'],
  },
];
