/**
 * A small .xlsx writer — formatted exports without an Excel library.
 *
 * An .xlsx is a zip of XML files; entries are stored uncompressed (a valid
 * zip that Excel, LibreOffice and Google Sheets open). Text is written as
 * inline strings, so it is never run as a formula.
 *
 * sheet = {
 *   name, rows: [[cell]],
 *   columns?: [{ width }], freezeRows?, merges?: ['A1:F1'], rowHeights?: { 1: 28 },
 *   autoFilter?: 'A4:J9', tabColor?: '1E6B4A', gridLines?: false,
 *   landscape?: true, fitToWidth?: true,
 * }
 * cell  = string | number | null | { v, f?, style? }
 *   f: a formula without '=' (e.g. 'SUM(D2:D4)'); v is its cached result (number or text).
 *   style: one of the names in STYLES below.
 */

// App palette (theme/palette.js) and brand ink.
const C = { ink: 'FF23241F', muted: 'FF75705F', line: 'FFE4E0D4', card2: 'FFF1EEE6', white: 'FFFFFFFF',
  ok: 'FF1E6B4A', okBg: 'FFE7F1EB', warn: 'FF8F6A12', warnBg: 'FFF6EFDC', err: 'FFB3372B', errBg: 'FFF8E9E6',
  info: 'FF3A5B8C', infoBg: 'FFE9EEF6' };

// ₹ with Indian lakh / crore grouping.
const INR = '[&gt;=10000000]&quot;₹&quot;##\\,##\\,##\\,##0;[&gt;=100000]&quot;₹&quot;##\\,##\\,##0;&quot;₹&quot;##,##0';

const FONTS = [
  '<font><sz val="10"/><color rgb="' + C.ink + '"/><name val="Calibri"/></font>', // 0 normal
  '<font><b/><sz val="10"/><color rgb="' + C.ink + '"/><name val="Calibri"/></font>', // 1 bold
  '<font><sz val="9"/><color rgb="' + C.muted + '"/><name val="Calibri"/></font>', // 2 muted
  '<font><b/><sz val="16"/><color rgb="' + C.ink + '"/><name val="Calibri"/></font>', // 3 title
  '<font><b/><sz val="10"/><color rgb="' + C.white + '"/><name val="Calibri"/></font>', // 4 header (white)
  '<font><b/><sz val="11"/><color rgb="' + C.ink + '"/><name val="Calibri"/></font>', // 5 section
  '<font><b/><sz val="14"/><color rgb="' + C.ink + '"/><name val="Calibri"/></font>', // 6 big
  '<font><b/><sz val="10"/><color rgb="' + C.ok + '"/><name val="Calibri"/></font>', // 7 ok
  '<font><b/><sz val="10"/><color rgb="' + C.warn + '"/><name val="Calibri"/></font>', // 8 warn
  '<font><b/><sz val="10"/><color rgb="' + C.err + '"/><name val="Calibri"/></font>', // 9 err
  '<font><b/><sz val="10"/><color rgb="' + C.info + '"/><name val="Calibri"/></font>', // 10 info
  '<font><sz val="10"/><color rgb="' + C.ok + '"/><name val="Consolas"/></font>', // 11 bar
];
const fill = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>', // 0
  '<fill><patternFill patternType="gray125"/></fill>', // 1 (required)
  fill(C.ink), // 2 header
  fill(C.card2), // 3 total row
  fill(C.okBg), // 4
  fill(C.warnBg), // 5
  fill(C.errBg), // 6
  fill(C.infoBg), // 7
];
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>', // 0 none
  `<border><left/><right/><top/><bottom style="thin"><color rgb="${C.line}"/></bottom><diagonal/></border>`, // 1 hairline under
  `<border><left/><right/><top style="medium"><color rgb="${C.ink}"/></top><bottom/><diagonal/></border>`, // 2 total (rule above)
];
const NUM = { general: 0, inr: 164, pct: 9 }; // 9 = built-in "0%"

/** name → [numFmt, font, fill, border, { align, wrap }] */
const STYLE_DEFS = {
  default: ['general', 0, 0, 0],
  text: ['general', 0, 0, 1, { wrap: true, vertical: 'top' }],
  bold: ['general', 1, 0, 1],
  muted: ['general', 2, 0, 0],
  label: ['general', 2, 0, 1, { vertical: 'top' }],
  title: ['general', 3, 0, 0, { vertical: 'center' }],
  section: ['general', 5, 0, 0],
  header: ['general', 4, 2, 0, { vertical: 'center' }],
  headerRight: ['general', 4, 2, 0, { horizontal: 'right', vertical: 'center' }],
  inr: ['inr', 0, 0, 1],
  boldInr: ['inr', 1, 0, 1],
  bigInr: ['inr', 6, 0, 0, { horizontal: 'left' }],
  pct: ['pct', 0, 0, 1],
  bar: ['general', 11, 0, 1],
  totalLabel: ['general', 1, 3, 2],
  totalInr: ['inr', 1, 3, 2],
  totalPct: ['pct', 1, 3, 2],
  totalBlank: ['general', 1, 3, 2],
  ok: ['general', 7, 4, 0, { horizontal: 'center' }],
  warn: ['general', 8, 5, 0, { horizontal: 'center' }],
  err: ['general', 9, 6, 0, { horizontal: 'center' }],
  info: ['general', 10, 7, 0, { horizontal: 'center' }],
};
const STYLE_NAMES = Object.keys(STYLE_DEFS);
const STYLE = Object.fromEntries(STYLE_NAMES.map((n, i) => [n, i]));

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="${INR}"/></numFmts>
<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>
<fills count="${FILLS.length}">${FILLS.join('')}</fills>
<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${STYLE_NAMES.length}">${STYLE_NAMES.map((n) => {
  const [num, font, fillId, border, align] = STYLE_DEFS[n];
  const alignXml = align
    ? `<alignment${align.horizontal ? ` horizontal="${align.horizontal}"` : ''}${align.vertical ? ` vertical="${align.vertical}"` : ''}${align.wrap ? ' wrapText="1"' : ''}/>`
    : '';
  return `<xf numFmtId="${NUM[num]}" fontId="${font}" fillId="${fillId}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${alignXml ? ' applyAlignment="1">' + alignXml + '</xf>' : '/>'}`;
}).join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export const XLSX_STYLES = STYLE_NAMES;

const xml = (text) =>
  String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Control characters other than tab / newline aren't allowed in XML.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 0 → A, 25 → Z, 26 → AA … */
export function columnLetter(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel's rules for sheet names: ≤ 31 characters, none of : \ / ? * [ ]. */
const sheetName = (name) => String(name).replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet';

function cellXml(cell, ref) {
  if (cell === null || cell === undefined || cell === '') return '';
  const c = typeof cell === 'object' ? cell : { v: cell };
  const s = c.style && STYLE[c.style] ? ` s="${STYLE[c.style]}"` : '';
  if (c.f) {
    if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${s}><f>${xml(c.f)}</f><v>${c.v}</v></c>`;
    if (typeof c.v === 'string') return `<c r="${ref}"${s} t="str"><f>${xml(c.f)}</f><v>${xml(c.v)}</v></c>`;
    return `<c r="${ref}"${s}><f>${xml(c.f)}</f></c>`;
  }
  if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  if (c.v === null || c.v === undefined || c.v === '') return s ? `<c r="${ref}"${s}/>` : '';
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
}

function sheetXml(sheet) {
  const pr = sheet.tabColor || sheet.fitToWidth
    ? `<sheetPr>${sheet.tabColor ? `<tabColor rgb="FF${sheet.tabColor}"/>` : ''}${sheet.fitToWidth ? '<pageSetUpPr fitToPage="1"/>' : ''}</sheetPr>`
    : '';
  const pane = sheet.freezeRows
    ? `<pane ySplit="${sheet.freezeRows}" topLeftCell="A${sheet.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const views = `<sheetViews><sheetView workbookViewId="0"${sheet.gridLines === false ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews>`;
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 12}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const heights = sheet.rowHeights || {};
  const rows = sheet.rows
    .map((row, r) => {
      const ht = heights[r + 1] ? ` ht="${heights[r + 1]}" customHeight="1"` : '';
      return `<row r="${r + 1}"${ht}>${(row || []).map((cell, c) => cellXml(cell, `${columnLetter(c)}${r + 1}`)).join('')}</row>`;
    })
    .join('');
  const filter = sheet.autoFilter ? `<autoFilter ref="${sheet.autoFilter}"/>` : '';
  const merges = sheet.merges?.length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  const margins = '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>';
  const setup = sheet.landscape || sheet.fitToWidth
    ? `<pageSetup paperSize="9"${sheet.landscape ? ' orientation="landscape"' : ''}${sheet.fitToWidth ? ' fitToWidth="1" fitToHeight="0"' : ''}/>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pr}${views}${cols}<sheetData>${rows}</sheetData>${filter}${merges}${margins}${setup}</worksheet>`;
}

// ── Zip (stored, no compression) ────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  // A fixed timestamp (1 Jan 2026, 00:00) keeps output reproducible.
  const time = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const { name, data } of files) {
    const nameBytes = enc.encode(name);
    const body = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(body);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, body.length, true);
    local.setUint32(22, body.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, body);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, body.length, true);
    cd.setUint32(24, body.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + body.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Sheets → the bytes of an .xlsx file. */
export function buildXlsx(sheets) {
  const names = sheets.map((s) => sheetName(s.name));
  const files = [
    {
      name: '[Content_Types].xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
        .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
        .join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
        .map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets>${sheets.some((s) => s.autoFilter) ? `<definedNames>${sheets
        .map((s, i) => (s.autoFilter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${xml(names[i]).replace(/'/g, "''")}'!${absolute(s.autoFilter)}</definedName>` : ''))
        .join('')}</definedNames>` : ''}</workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return zip(files);
}

/** 'A4:J9' → '$A$4:$J$9' (the filter range Excel stores alongside an autoFilter). */
const absolute = (range) => range.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');

export function downloadXlsx(filename, sheets) {
  const blob = new Blob([buildXlsx(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
