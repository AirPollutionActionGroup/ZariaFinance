/**
 * Minimal CSV export. `fields` is [{ header, value(row), asText? }]. Values are
 * quoted when they contain a comma, quote or newline (RFC 4180); a UTF-8 BOM is
 * prepended on download so Excel shows ₹ and other non-ASCII text correctly.
 *
 * Two Excel safeguards:
 *  - Formula injection: a text value that Excel would run as a formula
 *    (starting with = @ tab or CR, or + / - followed by more than a number or
 *    phone number) gets a leading ' so it's shown as text, never executed.
 *    The CSV import reader removes that ' again (see lib/import/csvImport.js).
 *  - `asText: true` on a field keeps a long digit string (bank account,
 *    Aadhaar) as text — written as ="0123…" — so Excel doesn't turn it into
 *    1.23E+17 and drop leading zeros or digits past the 15th.
 */
const FORMULA_START = /^[=@\t\r]/;
const SIGNED = /^[+-]/;
/** + / - followed only by digits, spaces and phone punctuation: a number or phone number, safe. */
const NUMBER_OR_PHONE = /^[+-][\d\s().,-]*$/;

/** The guarded text for a cell value: a leading ' when Excel would read it as a formula. */
export function guardFormula(text) {
  if (FORMULA_START.test(text) || (SIGNED.test(text) && !NUMBER_OR_PHONE.test(text))) return `'${text}`;
  return text;
}

function escapeCell(value, asText) {
  if (value === null || value === undefined || value === '') return '';
  let text = String(value);
  if (asText && /^\d+$/.test(text)) {
    text = `="${text}"`;
  } else if (typeof value === 'string') {
    text = guardFormula(text);
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(fields, rows) {
  const header = fields.map((f) => escapeCell(f.header)).join(',');
  const body = rows.map((row) => fields.map((f) => escapeCell(f.value(row), f.asText)).join(','));
  return [header, ...body].join('\r\n');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
