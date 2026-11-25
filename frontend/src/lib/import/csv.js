/**
 * Minimal CSV reader (RFC 4180): quoted fields, "" escapes, commas and line
 * breaks inside quotes, CRLF or LF line endings, and the UTF-8 BOM Excel adds.
 * Returns an array of rows, each an array of cell strings; blank lines are dropped.
 */
export function parseCsv(text) {
  // Strip the byte-order mark Excel puts at the start of a UTF-8 CSV.
  const raw = String(text ?? '');
  const src = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** "Fund Profile Code" / "fund-profile-code" / "fund_profile_code" → "fund_profile_code". */
export const normaliseHeader = (h) => String(h ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
