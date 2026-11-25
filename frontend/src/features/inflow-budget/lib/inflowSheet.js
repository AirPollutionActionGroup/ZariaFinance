/**
 * Inflow exports beyond plain CSV — Excel workbooks and printable A4 sheets (PDF):
 *  - trancheWorkbook / trancheSheetHtml: one grant tranche (from its page)
 *  - scheduleWorkbook / scheduleSheetHtml: the whole inflow schedule (from the list)
 * Inputs are view rows from lib/inflowView.js. In Excel, totals and outstanding
 * are formulas with cached values, so edits recalculate.
 */
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { BOOK } from '../../../shared/constants/book.js';
import { QUARTERS } from '../../budget/constants.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { FUNDING_SOURCE_TYPE, RECEIPT_STATUS } from '../constants.js';

const share = (part, whole) => (whole > 0 ? part / whole : 0);
const pctText = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
const sumOf = (list, pick) => list.reduce((s, r) => s + (Number(pick(r)) || 0), 0);
const sourceLabel = (r) => FUNDING_SOURCE_TYPE[r.fundingSource] || r.fundingSource || '';
const quarterLabel = (key) => QUARTERS.find((q) => q.key === key)?.label || '';
const bookLabel = (code) => (BOOK[code] ? `${code} · ${BOOK[code]}` : code || '');

/** Status label → xlsx style / PDF colour tone. */
const STATUS_TONE = {
  [RECEIPT_STATUS.RECEIVED]: 'ok',
  [RECEIPT_STATUS.DUE]: 'neutral',
  [RECEIPT_STATUS.PENDING]: 'warn',
  [RECEIPT_STATUS.OVERDUE]: 'err',
};
const STATUS_ORDER = [RECEIPT_STATUS.OVERDUE, RECEIPT_STATUS.PENDING, RECEIPT_STATUS.DUE, RECEIPT_STATUS.RECEIVED];
const statusStyle = (s) => (STATUS_TONE[s] && STATUS_TONE[s] !== 'neutral' ? STATUS_TONE[s] : 'bold');
const lateText = (r) =>
  r.status === RECEIPT_STATUS.RECEIVED
    ? r.actualDate && new Date(r.actualDate) <= new Date(r.expectedDate) ? 'On time' : 'Late'
    : r.daysLate
      ? `${r.daysLate} ${r.daysLate === 1 ? 'day' : 'days'} late`
      : 'On track';

/** The tranche facts shown at the top of the single-tranche exports. */
function trancheDetails(t) {
  return [
    ['Tranche', t.trancheCode || String(t.id)],
    ['Funding record', t.profileCode || '—'],
    ['Donor', t.donor || '—'],
    ['Funding source', sourceLabel(t)],
    ['Book', bookLabel(t.book)],
    ['Financial year', t.fy ? `FY ${t.fy}` : '—'],
    ['Quarter', quarterLabel(t.quarter) || '—'],
    ['Expected date', formatDate(t.expectedDate)],
    ['FCRA', t.fcraApplicable ? 'Applicable' : 'Not applicable'],
  ];
}

/** Foreign-currency facts for an FC tranche (empty for LC or when not recorded). */
function foreignDetails(t) {
  const fc = t.foreign;
  if (!fc) return [];
  const rate = Number(fc.fxRate) || 0;
  return [
    [`Expected in ${fc.currency}`, fc.expectedForeignAmount != null ? formatForeign(fc.currency, fc.expectedForeignAmount) : '—'],
    ['FX rate', rate ? `₹${rate.toLocaleString('en-IN', { maximumFractionDigits: 4 })} per ${fc.currency}` : '—'],
    ['Rate source', [fc.fxRateSourceLabel, fc.fxRateDate ? formatDate(fc.fxRateDate) : null].filter(Boolean).join(' · ') || '—'],
    ['Whole commitment', fc.commitmentForeignAmount != null ? `${formatForeign(fc.currency, fc.commitmentForeignAmount)} = ${formatInrExact(fc.commitmentInrAmount)}` : '—'],
    [`Outstanding in ${fc.currency}`, t.outstanding > 0 && rate ? `≈ ${formatForeign(fc.currency, Math.round((t.outstanding / rate) * 100) / 100)}` : '—'],
  ];
}

// ── Excel ────────────────────────────────────────────────────────────────────

const BAR = (ref) => `REPT("█",ROUND(${ref}*20,0))`;
const barText = (fraction) => '█'.repeat(Math.max(0, Math.min(20, Math.round(fraction * 20))));
const labelValue = (label, value, style = 'text') => [{ v: label, style: 'label' }, { v: value, style }];

/** One tranche → Summary (facts, figures, foreign side) + Receipts (with a SUM total). */
export function trancheWorkbook(t) {
  const receipts = t.receipts || [];
  const head = 4;
  const first = head + 1;
  const last = head + receipts.length;
  const totalRow = last + 1;
  const receivedRef = receipts.length ? `Receipts!$E$${totalRow}` : '0';
  const title = t.line || t.trancheCode || `Tranche ${t.id}`;
  const sub = [t.trancheCode, t.donor, t.fy ? `FY ${t.fy}` : null].filter(Boolean).join(' · ');

  const receiptsSheet = {
    name: 'Receipts',
    tabColor: '1E6B4A',
    freezeRows: head,
    autoFilter: receipts.length ? `A${head}:E${last}` : undefined,
    merges: ['A1:E1', 'A2:E2'],
    rowHeights: { 1: 26, [head]: 22 },
    columns: [{ width: 6 }, { width: 16 }, { width: 14 }, { width: 30 }, { width: 16 }],
    rows: [
      [{ v: `${title} — receipts`, style: 'title' }],
      [{ v: sub, style: 'muted' }],
      [],
      [
        ...['#', 'Credit note', 'Received on', 'Receipt ref / UTR'].map((v) => ({ v, style: 'header' })),
        { v: 'Amount', style: 'headerRight' },
      ],
      ...receipts.map((r, i) => [
        { v: i + 1, style: 'text' },
        { v: r.creditNoteId || '', style: 'bold' },
        { v: formatDate(r.date), style: 'text' },
        { v: r.reference || '—', style: 'text' },
        { v: Number(r.amount) || 0, style: 'inr' },
      ]),
      [
        { v: `Total · ${receipts.length} ${receipts.length === 1 ? 'instalment' : 'instalments'}`, style: 'totalLabel' },
        { v: '', style: 'totalBlank' },
        { v: '', style: 'totalBlank' },
        { v: '', style: 'totalBlank' },
        { f: receipts.length ? `SUM(E${first}:E${last})` : '0', v: t.received, style: 'totalInr' },
      ],
    ],
  };

  const rows = [];
  rows.push([{ v: title, style: 'title' }]);
  rows.push([{ v: sub, style: 'muted' }]);
  rows.push([]);
  rows.push(labelValue('Status', t.status, statusStyle(t.status)));
  rows.push(labelValue('Timing', lateText(t), 'bold'));
  rows.push([]);
  rows.push([{ v: 'Key figures', style: 'section' }]);
  const expectedRow = rows.length + 1;
  rows.push([{ v: 'Expected', style: 'label' }, { v: t.expected, style: 'bigInr' }]);
  const receivedRow = rows.length + 1;
  rows.push([{ v: 'Received', style: 'label' }, { f: receivedRef, v: t.received, style: 'bigInr' }]);
  rows.push([
    { v: 'Outstanding', style: 'label' },
    { f: `MAX(0,B${expectedRow}-B${receivedRow})`, v: t.outstanding, style: 'bigInr' },
  ]);
  if (t.extra > 0) rows.push([{ v: 'Received extra', style: 'label' }, { f: `MAX(0,B${receivedRow}-B${expectedRow})`, v: t.extra, style: 'boldInr' }]);
  const pctRow = rows.length + 1;
  rows.push([{ v: 'Collected', style: 'label' }, { f: `IF(B${expectedRow}=0,0,B${receivedRow}/B${expectedRow})`, v: share(t.received, t.expected), style: 'pct' }]);
  rows.push([{ v: '', style: 'label' }, { f: BAR(`MIN(1,B${pctRow})`), v: barText(Math.min(1, share(t.received, t.expected))), style: 'bar' }]);
  rows.push([{ v: 'Receipts', style: 'label' }, { v: receipts.length, style: 'bold' }]);
  if (t.actualDate) rows.push(labelValue('Last received', formatDate(t.actualDate), 'bold'));
  rows.push([]);
  rows.push([{ v: 'Tranche', style: 'section' }]);
  for (const [label, value] of trancheDetails(t)) rows.push(labelValue(label, value));
  const fx = foreignDetails(t);
  if (fx.length) {
    rows.push([]);
    rows.push([{ v: 'Foreign contribution', style: 'section' }]);
    for (const [label, value] of fx) rows.push(labelValue(label, value));
  }

  const summary = {
    name: 'Summary',
    tabColor: 'F7EB22',
    gridLines: false,
    fitToWidth: true,
    merges: ['A1:C1', 'A2:C2'],
    rowHeights: { 1: 28 },
    columns: [{ width: 22 }, { width: 40 }, { width: 10 }],
    rows,
  };
  return [summary, receiptsSheet];
}

/** The whole schedule → Summary dashboard, Tranches (filter, formulas, totals), Receipts. */
export function scheduleWorkbook(rows, { fyLabel = 'All years', asAt = new Date() } = {}) {
  const n = rows.length;

  // ── Tranches
  const head = 4;
  const first = head + 1;
  const last = head + n;
  const totalRow = last + 1;
  const sum = (col) => (n ? `SUM(${col}${first}:${col}${last})` : '0');
  const tranches = {
    name: 'Tranches',
    tabColor: '23241F',
    freezeRows: head,
    autoFilter: `A${head}:N${Math.max(last, head)}`,
    landscape: true,
    fitToWidth: true,
    merges: ['A1:N1', 'A2:N2'],
    rowHeights: { 1: 26, [head]: 22 },
    columns: [
      { width: 16 }, { width: 38 }, { width: 26 }, { width: 13 }, { width: 6 }, { width: 6 }, { width: 13 },
      { width: 14 }, { width: 14 }, { width: 14 }, { width: 9 }, { width: 13 }, { width: 11 }, { width: 13 },
    ],
    rows: [
      [{ v: `Inflow schedule — ${fyLabel}`, style: 'title' }],
      [{ v: `${n} ${n === 1 ? 'tranche' : 'tranches'} · as at ${formatDate(asAt)}`, style: 'muted' }],
      [],
      [
        ...['Tranche', 'Description', 'Donor', 'Source', 'Book', 'Qtr', 'Expected date'].map((v) => ({ v, style: 'header' })),
        ...['Expected', 'Received', 'Outstanding', 'Collected'].map((v) => ({ v, style: 'headerRight' })),
        ...['Last received', 'Status', 'Timing'].map((v) => ({ v, style: 'header' })),
      ],
      ...rows.map((r, i) => {
        const row = first + i;
        return [
          { v: r.trancheCode || String(r.id), style: 'bold' },
          { v: r.line || '', style: 'text' },
          { v: r.donor || '', style: 'text' },
          { v: sourceLabel(r), style: 'text' },
          { v: r.book || '', style: 'text' },
          { v: quarterLabel(r.quarter), style: 'text' },
          { v: formatDate(r.expectedDate), style: 'text' },
          { v: r.expected, style: 'inr' },
          { v: r.received, style: 'inr' },
          { f: `MAX(0,H${row}-I${row})`, v: r.outstanding, style: 'boldInr' },
          { f: `IF(H${row}=0,0,I${row}/H${row})`, v: share(r.received, r.expected), style: 'pct' },
          { v: r.actualDate ? formatDate(r.actualDate) : '—', style: 'text' },
          { v: r.status, style: statusStyle(r.status) },
          { v: lateText(r), style: 'text' },
        ];
      }),
      [
        { v: `Total · ${n} ${n === 1 ? 'tranche' : 'tranches'}`, style: 'totalLabel' },
        ...Array.from({ length: 6 }, () => ({ v: '', style: 'totalBlank' })),
        { f: sum('H'), v: sumOf(rows, (r) => r.expected), style: 'totalInr' },
        { f: sum('I'), v: sumOf(rows, (r) => r.received), style: 'totalInr' },
        { f: sum('J'), v: sumOf(rows, (r) => r.outstanding), style: 'totalInr' },
        { f: `IF(H${totalRow}=0,0,I${totalRow}/H${totalRow})`, v: share(sumOf(rows, (r) => r.received), sumOf(rows, (r) => r.expected)), style: 'totalPct' },
        ...Array.from({ length: 3 }, () => ({ v: '', style: 'totalBlank' })),
      ],
    ],
  };
  const ref = (col) => `Tranches!$${col}$${totalRow}`;

  // ── Receipts
  const receiptRows = rows.flatMap((t) => (t.receipts || []).map((rc, i) => ({ t, rc, n: i + 1 })));
  const rFirst = 5;
  const rLast = 4 + receiptRows.length;
  const receiptsSheet = {
    name: 'Receipts',
    tabColor: '1E6B4A',
    freezeRows: 4,
    autoFilter: receiptRows.length ? `A4:G${rLast}` : undefined,
    merges: ['A1:G1', 'A2:G2'],
    rowHeights: { 1: 26, 4: 22 },
    columns: [{ width: 16 }, { width: 26 }, { width: 6 }, { width: 15 }, { width: 13 }, { width: 26 }, { width: 14 }],
    rows: [
      [{ v: `Receipts — ${fyLabel}`, style: 'title' }],
      [{ v: `${receiptRows.length} credit ${receiptRows.length === 1 ? 'note' : 'notes'} received against these tranches`, style: 'muted' }],
      [],
      [
        ...['Tranche', 'Donor', '#', 'Credit note', 'Received on', 'Receipt ref / UTR'].map((v) => ({ v, style: 'header' })),
        { v: 'Amount', style: 'headerRight' },
      ],
      ...receiptRows.map(({ t, rc, n: k }) => [
        { v: t.trancheCode || String(t.id), style: 'bold' },
        { v: t.donor || '', style: 'text' },
        { v: k, style: 'text' },
        { v: rc.creditNoteId || '', style: 'text' },
        { v: formatDate(rc.date), style: 'text' },
        { v: rc.reference || '—', style: 'text' },
        { v: Number(rc.amount) || 0, style: 'inr' },
      ]),
      [
        { v: `Total · ${receiptRows.length}`, style: 'totalLabel' },
        ...Array.from({ length: 5 }, () => ({ v: '', style: 'totalBlank' })),
        { f: receiptRows.length ? `SUM(G${rFirst}:G${rLast})` : '0', v: sumOf(receiptRows, (x) => x.rc.amount), style: 'totalInr' },
      ],
    ],
  };

  // ── Summary dashboard
  const expected = sumOf(rows, (r) => r.expected);
  const received = sumOf(rows, (r) => r.received);
  const s = [];
  s.push([{ v: 'Inflow schedule', style: 'title' }]);
  s.push([{ v: `${fyLabel} · as at ${formatDate(asAt)}`, style: 'muted' }]);
  s.push([]);
  s.push([{ v: 'Expected', style: 'label' }, { f: ref('H'), v: expected, style: 'bigInr' }]);
  s.push([{ v: 'Received', style: 'label' }, { f: ref('I'), v: received, style: 'bigInr' }]);
  s.push([{ v: 'Outstanding', style: 'label' }, { f: ref('J'), v: sumOf(rows, (r) => r.outstanding), style: 'bigInr' }]);
  s.push([{ v: 'Collected', style: 'label' }, { f: ref('K'), v: share(received, expected), style: 'pct' }]);
  s.push([{ v: 'Tranches', style: 'label' }, { v: n, style: 'bold' }]);
  s.push([]);

  /** Titled breakdown with amount, share of the expected total and an in-cell bar. */
  const breakdown = (title, items, amountHeader = 'Expected') => {
    s.push([{ v: title, style: 'section' }]);
    s.push([
      { v: '', style: 'header' },
      { v: '', style: 'header' },
      { v: amountHeader, style: 'headerRight' },
      { v: 'Received', style: 'headerRight' },
      { v: 'Collected', style: 'headerRight' },
      { v: '', style: 'header' },
    ]);
    const start = s.length + 1;
    for (const it of items) {
      const r = s.length + 1;
      s.push([
        { v: it.label, style: it.style || 'bold' },
        { v: it.sub || '', style: 'label' },
        { v: it.expected, style: 'inr' },
        { v: it.received, style: 'inr' },
        { f: `IF(C${r}=0,0,D${r}/C${r})`, v: share(it.received, it.expected), style: 'pct' },
        { f: BAR(`MIN(1,E${r})`), v: barText(Math.min(1, share(it.received, it.expected))), style: 'bar' },
      ]);
    }
    const end = s.length;
    s.push([
      { v: 'Total', style: 'totalLabel' },
      { v: '', style: 'totalBlank' },
      { f: items.length ? `SUM(C${start}:C${end})` : '0', v: sumOf(items, (i) => i.expected), style: 'totalInr' },
      { f: items.length ? `SUM(D${start}:D${end})` : '0', v: sumOf(items, (i) => i.received), style: 'totalInr' },
      { f: `IF(C${end + 1}=0,0,D${end + 1}/C${end + 1})`, v: share(sumOf(items, (i) => i.received), sumOf(items, (i) => i.expected)), style: 'totalPct' },
      { v: '', style: 'totalBlank' },
    ]);
    s.push([]);
  };
  const group = (keyOf, keys) =>
    keys.map((k) => {
      const inK = rows.filter((r) => keyOf(r) === k);
      return { key: k, count: inK.length, expected: sumOf(inK, (r) => r.expected), received: sumOf(inK, (r) => r.received) };
    });

  breakdown(
    'By quarter',
    group((r) => r.quarter, QUARTERS.map((q) => q.key)).map((g, i) => ({ label: QUARTERS[i].label, sub: QUARTERS[i].months, ...g })),
  );
  breakdown(
    'By status',
    group((r) => r.status, STATUS_ORDER)
      .filter((g) => g.count)
      .map((g) => ({ label: g.key, sub: `${g.count} ${g.count === 1 ? 'tranche' : 'tranches'}`, style: statusStyle(g.key), ...g })),
  );
  breakdown(
    'By funding source',
    group((r) => r.fundingSource, Object.keys(FUNDING_SOURCE_TYPE))
      .filter((g) => g.count)
      .map((g) => ({ label: FUNDING_SOURCE_TYPE[g.key], sub: `${g.count} ${g.count === 1 ? 'tranche' : 'tranches'}`, ...g })),
  );
  const donors = [...new Set(rows.map((r) => r.donor || '—'))];
  breakdown(
    'By donor',
    group((r) => r.donor || '—', donors)
      .sort((a, b) => b.expected - a.expected)
      .map((g) => ({ label: g.key, sub: `${g.count} ${g.count === 1 ? 'tranche' : 'tranches'}`, ...g })),
  );

  const summary = {
    name: 'Summary',
    tabColor: 'F7EB22',
    gridLines: false,
    fitToWidth: true,
    merges: ['A1:F1', 'A2:F2'],
    rowHeights: { 1: 28 },
    columns: [{ width: 26 }, { width: 18 }, { width: 15 }, { width: 15 }, { width: 11 }, { width: 22 }],
    rows: s,
  };

  return [summary, tranches, receiptsSheet];
}

// ── Printable sheets (PDF) ──────────────────────────────────────────────────

const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const money = (v) => esc(formatInrExact(Number(v) || 0));
const TONE_CSS = {
  ok: ['#1E6B4A', '#E7F1EB'],
  info: ['#3A5B8C', '#E9EEF6'],
  warn: ['#8F6A12', '#F6EFDC'],
  err: ['#B3372B', '#F8E9E6'],
  neutral: ['#75705F', '#F1EEE6'],
};
const chip = (status) => {
  const [fg, bg] = TONE_CSS[STATUS_TONE[status] || 'neutral'];
  return `<span class="chip" style="color:${fg};background:${bg}">${esc(status)}</span>`;
};

/** Shared page frame: brand bar, A4 page rules, footer with page numbers. */
function page({ title, docLabel, footTag, landscape = false, printedBy, printedAt, body }) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 11mm 15mm; @bottom-left { content: "${String(footTag).replace(/[^\w ·-]/g, '')} · Zariya"; font: 8px sans-serif; color: #75705F; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8px sans-serif; color: #75705F; } }
  * { box-sizing: border-box; }
  body { font: 10.5px/1.45 "Segoe UI", Arial, sans-serif; color: #23241F; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { max-width: ${landscape ? '275mm' : '188mm'}; margin: 0 auto; }
  .brand { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #F7EB22; padding-bottom: 6px; margin-bottom: 12px; }
  .brand b { font-size: 13px; } .brand span { color: #75705F; font-size: 9.5px; }
  .eyebrow { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #75705F; }
  .titlerow { display: flex; align-items: center; gap: 10px; margin: 2px 0 10px; flex-wrap: wrap; }
  h1 { font-size: 20px; margin: 0; }
  .chip { display: inline-block; padding: 2px 9px; border-radius: 12px; font-weight: 700; font-size: 9.5px; white-space: nowrap; }
  .titlerow .chip { font-size: 10.5px; padding: 3px 11px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 8px; }
  .kpi { border: 1px solid #E4E0D4; border-radius: 6px; padding: 8px 10px; }
  .kpi span { display: block; color: #75705F; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  .kpi b { font-size: 15px; font-variant-numeric: tabular-nums; } .kpi small { display: block; color: #75705F; font-size: 8.5px; }
  .kpi.main { background: #23241F; color: #fff; border-color: #23241F; } .kpi.main span { color: #F7EB22; } .kpi.main small { color: #C9C5B8; }
  .meter { margin: 4px 0 12px; } .meter .top { display: flex; justify-content: space-between; font-size: 9.5px; font-weight: 700; margin-bottom: 3px; }
  .track { height: 8px; background: #F1EEE6; border-radius: 4px; overflow: hidden; } .fill { height: 100%; background: #1E6B4A; border-radius: 4px; }
  h2 { font-size: 10.5px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .08em; border-left: 3px solid #1E6B4A; padding-left: 6px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .facts { width: 100%; border-collapse: collapse; } .facts td { padding: 4px 0; border-bottom: 1px solid #F1EEE6; } .facts td:first-child { color: #75705F; width: 42%; } .facts td:last-child { font-weight: 600; text-align: right; }
  .barrow { display: grid; grid-template-columns: 30% 1fr 34%; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid #F1EEE6; }
  .barlabel { font-weight: 600; } .barlabel small, .baramt small { display: block; color: #75705F; font-size: 8.5px; font-weight: 400; }
  .baramt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  table.grid { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  .grid th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #fff; background: #23241F; padding: 5px 6px; }
  .grid td { border-bottom: 1px solid #E4E0D4; padding: 5px 6px; vertical-align: top; }
  .grid tbody tr:nth-child(even) td { background: #FAF9F5; }
  .grid tfoot td { font-weight: 700; background: #F1EEE6; border-top: 2px solid #23241F; border-bottom: none; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .code { font-family: Consolas, monospace; font-weight: 700; white-space: nowrap; }
  .muted { color: #75705F; font-size: 9px; } .late { color: #B3372B; font-size: 9px; } .okt { color: #1E6B4A; font-size: 9px; }
  .empty { padding: 14px; text-align: center; color: #75705F; border: 1px dashed #E4E0D4; border-radius: 6px; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 28px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #23241F; padding-top: 4px; font-size: 9.5px; } .sign small { display: block; color: #75705F; margin-top: 12px; }
  .foot { margin-top: 14px; font-size: 8.5px; color: #75705F; }
  tr, .barrow, .kpi { page-break-inside: avoid; }
  @media screen { body { background: #EFEDE6; } .wrap { background: #fff; padding: 12mm; margin: 10mm auto; box-shadow: 0 1px 8px rgba(0,0,0,.12); } }
</style></head>
<body><div class="wrap">
  <div class="brand"><b>Zariya · ${esc(docLabel)}</b><span>Printed ${esc(formatDate(printedAt))}${printedBy ? ` by ${esc(printedBy)}` : ''}</span></div>
  ${body}
  <div class="foot">${esc(footTag)} · generated from Zariya — figures as on ${esc(formatDate(printedAt))}.</div>
</div></body></html>`;
}

const meter = (received, expected) => {
  const pct = Math.min(100, Math.round(share(received, expected) * 100));
  return `<div class="meter"><div class="top"><span>Collected</span><span>${pctText(received, expected)} of expected</span></div><div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
};

/** One tranche — A4 portrait, for filing with the receipt or sign-off. */
export function trancheSheetHtml(t, { printedBy = '', printedAt = new Date() } = {}) {
  const receipts = t.receipts || [];
  const fc = t.foreign;
  const fx = foreignDetails(t);
  const body = `
  <div class="eyebrow">${esc([t.profileCode, t.trancheCode, t.fy ? `FY ${t.fy}` : null].filter(Boolean).join(' · '))}</div>
  <div class="titlerow"><h1>${esc(t.line || t.trancheCode)}</h1>${chip(t.status)}</div>

  <div class="kpis">
    <div class="kpi main"><span>Expected</span><b>${money(t.expected)}</b><small>${fc?.expectedForeignAmount != null ? esc(formatForeign(fc.currency, fc.expectedForeignAmount)) + ' · ' : ''}due ${esc(formatDate(t.expectedDate))}</small></div>
    <div class="kpi"><span>Received</span><b>${money(t.received)}</b><small>${receipts.length} ${receipts.length === 1 ? 'instalment' : 'instalments'}</small></div>
    <div class="kpi"><span>${t.extra > 0 ? 'Received extra' : 'Outstanding'}</span><b>${money(t.extra > 0 ? t.extra : t.outstanding)}</b><small>${t.extra > 0 ? 'more than expected' : t.outstanding ? 'still to come' : 'fully received'}</small></div>
    <div class="kpi"><span>Status</span><b>${esc(t.status)}</b><small>${esc(lateText(t))}</small></div>
  </div>
  ${meter(t.received, t.expected)}

  <div class="${fx.length ? 'two' : ''}">
    <div><h2>Tranche</h2><table class="facts">${trancheDetails(t).map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>
    ${fx.length ? `<div><h2>Foreign contribution</h2><table class="facts">${fx.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>` : ''}
  </div>

  <h2>Receipts · ${receipts.length}</h2>
  ${
    receipts.length
      ? `<table class="grid"><thead><tr><th>#</th><th>Credit note</th><th>Received on</th><th>Receipt ref / UTR</th><th class="r">Amount</th></tr></thead><tbody>
    ${receipts.map((r, i) => `<tr><td>${i + 1}</td><td class="code">${esc(r.creditNoteId)}</td><td>${esc(formatDate(r.date))}</td><td>${esc(r.reference || '—')}</td><td class="r"><b>${money(r.amount)}</b></td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4">Total received · ${receipts.length} ${receipts.length === 1 ? 'instalment' : 'instalments'}</td><td class="r">${money(t.received)}</td></tr></tfoot></table>`
      : '<div class="empty">Nothing received yet against this tranche.</div>'
  }

  <div class="sign">
    <div>Prepared by<small>Name &amp; date</small></div>
    <div>Verified by<small>Name &amp; date</small></div>
    <div>Approved by<small>Name &amp; date</small></div>
  </div>`;
  return page({
    title: `${t.trancheCode || t.id} — ${t.line || ''}`,
    docLabel: 'Inflow tranche',
    footTag: t.trancheCode || String(t.id),
    printedBy,
    printedAt,
    body,
  });
}

/** The whole schedule — A4 landscape report. */
export function scheduleSheetHtml(rows, { fyLabel = 'All years', filterNote = '', printedBy = '', printedAt = new Date() } = {}) {
  const expected = sumOf(rows, (r) => r.expected);
  const received = sumOf(rows, (r) => r.received);
  const outstanding = sumOf(rows, (r) => r.outstanding);
  const overdue = rows.filter((r) => r.status === RECEIPT_STATUS.OVERDUE);
  const bars = (items) =>
    items
      .map(
        (it) => `<div class="barrow"><div class="barlabel">${esc(it.label)}<small>${esc(it.sub || '')}</small></div>
        <div class="track"><div class="fill" style="width:${Math.min(100, Math.round(share(it.received, it.expected) * 100))}%"></div></div>
        <div class="baramt">${money(it.received)} <span class="muted">of</span> ${money(it.expected)}<small>${pctText(it.received, it.expected)} collected</small></div></div>`,
      )
      .join('');
  const by = (keyOf, keys, labelOf, subOf) =>
    keys
      .map((k) => {
        const inK = rows.filter((r) => keyOf(r) === k);
        return { label: labelOf(k), sub: subOf ? subOf(k, inK) : `${inK.length} ${inK.length === 1 ? 'tranche' : 'tranches'}`, count: inK.length, expected: sumOf(inK, (r) => r.expected), received: sumOf(inK, (r) => r.received) };
      })
      .filter((g) => g.count);

  const body = `
  <div class="eyebrow">${esc(fyLabel)}${filterNote ? ` · ${esc(filterNote)}` : ''}</div>
  <div class="titlerow"><h1>Inflow schedule</h1></div>

  <div class="kpis">
    <div class="kpi main"><span>Expected</span><b>${money(expected)}</b><small>${rows.length} ${rows.length === 1 ? 'tranche' : 'tranches'}</small></div>
    <div class="kpi"><span>Received</span><b>${money(received)}</b><small>${pctText(received, expected)} of expected</small></div>
    <div class="kpi"><span>Outstanding</span><b>${money(outstanding)}</b><small>still to come in</small></div>
    <div class="kpi"><span>Overdue</span><b style="color:${overdue.length ? '#B3372B' : 'inherit'}">${money(sumOf(overdue, (r) => r.outstanding))}</b><small>${overdue.length} ${overdue.length === 1 ? 'tranche' : 'tranches'}</small></div>
  </div>
  ${meter(received, expected)}

  <div class="two">
    <div><h2>By quarter</h2>${bars(by((r) => r.quarter, QUARTERS.map((q) => q.key), (k) => QUARTERS.find((q) => q.key === k).label, (k, inK) => `${QUARTERS.find((q) => q.key === k).months} · ${inK.length} ${inK.length === 1 ? 'tranche' : 'tranches'}`))}</div>
    <div><h2>By status</h2>${bars(by((r) => r.status, STATUS_ORDER, (k) => k))}</div>
  </div>

  <h2>Tranches · ${rows.length}</h2>
  <table class="grid">
    <thead><tr><th>Tranche</th><th>Description · donor</th><th>Source</th><th>Book</th><th>Expected</th><th class="r">Expected ₹</th><th class="r">Received ₹</th><th class="r">Outstanding ₹</th><th class="r">%</th><th>Status</th></tr></thead>
    <tbody>
    ${rows
      .map(
        (r) => `<tr><td class="code">${esc(r.trancheCode || r.id)}</td><td>${esc(r.line)}<div class="muted">${esc(r.donor || '')}</div></td><td>${esc(sourceLabel(r))}</td><td>${esc(r.book)}</td><td style="white-space:nowrap">${esc(quarterLabel(r.quarter))} · ${esc(formatDate(r.expectedDate))}<div class="${r.status === RECEIPT_STATUS.RECEIVED ? 'okt' : r.daysLate ? 'late' : 'muted'}">${esc(r.status === RECEIPT_STATUS.RECEIVED ? `Received ${formatDate(r.actualDate)}` : lateText(r))}</div></td><td class="r">${money(r.expected)}</td><td class="r">${r.received ? money(r.received) : '<span class="muted">—</span>'}</td><td class="r"><b>${r.outstanding ? money(r.outstanding) : '<span class="muted">—</span>'}</b></td><td class="r muted">${pctText(r.received, r.expected)}</td><td>${chip(r.status)}</td></tr>`,
      )
      .join('')}
    </tbody>
    <tfoot><tr><td colspan="5">Total · ${rows.length} ${rows.length === 1 ? 'tranche' : 'tranches'}</td><td class="r">${money(expected)}</td><td class="r">${money(received)}</td><td class="r">${money(outstanding)}</td><td class="r">${pctText(received, expected)}</td><td></td></tr></tfoot>
  </table>`;
  return page({
    title: `Inflow schedule — ${fyLabel}`,
    docLabel: 'Inflow schedule',
    footTag: `Inflow schedule ${fyLabel}`,
    landscape: true,
    printedBy,
    printedAt,
    body,
  });
}

/** Opens HTML in a new window and starts printing (Save as PDF). Returns false if the window was blocked. */
export function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
  return true;
}
