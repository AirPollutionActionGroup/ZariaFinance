/**
 * One budget, exported three ways from its page:
 *  - budgetWorkbook(budget):  Excel — a Summary dashboard (details, key figures,
 *    quarters / categories / books with shares and in-cell bars), Lines (Q1–Q4
 *    with SUM formulas, filter, totals) and Approval history.
 *  - budgetSheetHtml(budget): a printable A4 page for sign-off (Save as PDF).
 *  - budgetLinesSheetCsv(budget): the lines with readable headers, share of
 *    budget and a Total row.
 */
import { toCsv } from '../../../lib/export/csv.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate, formatDateTime } from '../../../lib/format/date.js';
import { BUDGET_STATUS, BUDGET_TYPE, QUARTERS, budgetTypeOf } from '../constants.js';
import { budgetTotal, lineTotal, quarterTotals, totalsBy } from './budgetMath.js';

const statusLabel = (s) => BUDGET_STATUS[s] || s || '';
/** Status → the app's chip colours (BUDGET_STATUS_TONE). */
const STATUS_TONE = { DRAFT: 'neutral', SUBMITTED: 'info', APPROVED: 'ok', REJECTED: 'err' };
const categoryOf = (budget) => (id) =>
  budget.lines.find((l) => String(l.category) === String(id))?.categoryName || `Category #${id}`;
const share = (part, whole) => (whole > 0 ? part / whole : 0);
const pctText = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—');
const BOOK_LABEL = { LC: 'LC · Local contribution', FC: 'FC · Foreign contribution' };
const approvedOn = (budget) => [...(budget.history || [])].reverse().find((h) => h.status === 'APPROVED')?.at;

/** Details shown at the top of every export. */
function details(budget) {
  return [
    ['Budget code', budget.budgetCode],
    ['Financial year', `FY ${budget.financialYear}`],
    ['Budget type', BUDGET_TYPE[budgetTypeOf(budget)] || ''],
    [budgetTypeOf(budget) === 'PROJECT' ? 'Project' : 'Programme / scope', budget.programme || ''],
    ['State', budget.stateName || 'All states'],
    ['Owner', budget.owner || '—'],
    ...(budget.notes ? [['Notes', budget.notes]] : []),
  ];
}

// ── Excel ────────────────────────────────────────────────────────────────────

const BAR = (ref) => `REPT("█",ROUND(${ref}*20,0))`;
const barText = (fraction) => '█'.repeat(Math.round(fraction * 20));

/** Sheets for lib/export/xlsx.js. Totals are formulas (with cached values), so edits recalculate. */
export function budgetWorkbook(budget) {
  const lines = budget.lines || [];
  const total = budgetTotal(lines);
  const q = quarterTotals(lines);
  const categoryName = categoryOf(budget);
  const tone = STATUS_TONE[budget.status];

  // ── Lines: title, then a filterable table from row 4.
  const head = 4;
  const first = head + 1;
  const last = head + lines.length;
  const totalRow = last + 1;
  const n = lines.length;
  const sumOf = (col) => (n ? `SUM(${col}${first}:${col}${last})` : '0');
  const linesSheet = {
    name: 'Lines',
    tabColor: '23241F',
    freezeRows: head,
    autoFilter: `A${head}:J${Math.max(last, head)}`,
    landscape: true,
    fitToWidth: true,
    merges: [`A1:J1`, `A2:J2`],
    rowHeights: { 1: 26, [head]: 22 },
    columns: [{ width: 9 }, { width: 24 }, { width: 42 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 10 }],
    rows: [
      [{ v: `${budget.name} — budget lines`, style: 'title' }],
      [{ v: `${budget.budgetCode} · FY ${budget.financialYear} · ${budget.programme || ''} · ${budget.stateName || 'All states'}`, style: 'muted' }],
      [],
      [
        ...['Line', 'Category', 'Description', 'Book'].map((v) => ({ v, style: 'header' })),
        ...QUARTERS.map((x) => ({ v: `${x.label} · ${x.months}`, style: 'headerRight' })),
        { v: 'Total', style: 'headerRight' },
        { v: 'Share', style: 'headerRight' },
      ],
      ...lines.map((l, i) => {
        const r = first + i;
        return [
          { v: l.lineCode, style: 'bold' },
          { v: l.categoryName || categoryName(l.category), style: 'text' },
          { v: l.description, style: 'text' },
          { v: l.book, style: 'text' },
          ...QUARTERS.map((x) => ({ v: Number(l[x.key]) || 0, style: 'inr' })),
          { f: `SUM(E${r}:H${r})`, v: lineTotal(l), style: 'boldInr' },
          { f: `IF($I$${totalRow}=0,0,I${r}/$I$${totalRow})`, v: share(lineTotal(l), total), style: 'pct' },
        ];
      }),
      [
        { v: `Total · ${n} ${n === 1 ? 'line' : 'lines'}`, style: 'totalLabel' },
        { v: '', style: 'totalBlank' },
        { v: '', style: 'totalBlank' },
        { v: '', style: 'totalBlank' },
        ...['E', 'F', 'G', 'H'].map((c, i) => ({ f: sumOf(c), v: q[QUARTERS[i].key], style: 'totalInr' })),
        { f: sumOf('I'), v: total, style: 'totalInr' },
        { f: total ? '1' : '0', v: total ? 1 : 0, style: 'totalPct' },
      ],
    ],
  };
  const totalRef = `Lines!$I$${totalRow}`;

  // ── Summary: a small dashboard.
  const rows = [];
  const merges = ['A1:E1', 'A2:E2'];
  rows.push([{ v: budget.name, style: 'title' }]);
  rows.push([{ v: `${budget.budgetCode} · FY ${budget.financialYear} · ${BUDGET_TYPE[budgetTypeOf(budget)] || ''}`, style: 'muted' }]);
  rows.push([]);
  rows.push([{ v: 'Status', style: 'label' }, { v: statusLabel(budget.status), style: tone === 'neutral' ? 'bold' : tone }]);
  rows.push([{ v: 'Total budget', style: 'label' }, { f: totalRef, v: total, style: 'bigInr' }]);
  rows.push([{ v: 'Budget lines', style: 'label' }, { v: n, style: 'bold' }]);
  const approved = approvedOn(budget);
  if (approved) rows.push([{ v: 'Approved on', style: 'label' }, { v: formatDate(approved), style: 'bold' }]);
  for (const [label, value] of details(budget)) rows.push([{ v: label, style: 'label' }, { v: value, style: 'text' }]);
  rows.push([]);

  /** A titled breakdown table with share % and in-cell bars, plus a total row. */
  const breakdown = (title, items) => {
    rows.push([{ v: title, style: 'section' }]);
    rows.push([
      { v: '', style: 'header' },
      { v: '', style: 'header' },
      { v: 'Amount', style: 'headerRight' },
      { v: 'Share', style: 'headerRight' },
      { v: '', style: 'header' },
    ]);
    const start = rows.length + 1;
    for (const it of items) {
      const r = rows.length + 1;
      rows.push([
        { v: it.label, style: 'bold' },
        { v: it.sub || '', style: 'label' },
        it.f ? { f: it.f, v: it.amount, style: 'inr' } : { v: it.amount, style: 'inr' },
        { f: `IF(${totalRef}=0,0,C${r}/${totalRef})`, v: share(it.amount, total), style: 'pct' },
        { f: BAR(`D${r}`), v: barText(share(it.amount, total)), style: 'bar' },
      ]);
    }
    const end = rows.length;
    rows.push([
      { v: 'Total', style: 'totalLabel' },
      { v: '', style: 'totalBlank' },
      { f: `SUM(C${start}:C${end})`, v: items.reduce((s, it) => s + it.amount, 0), style: 'totalInr' },
      { f: `SUM(D${start}:D${end})`, v: items.length ? 1 : 0, style: 'totalPct' },
      { v: '', style: 'totalBlank' },
    ]);
    rows.push([]);
  };

  breakdown(
    'Quarterly phasing',
    QUARTERS.map((x, i) => ({ label: x.label, sub: x.months, amount: q[x.key], f: `Lines!${'EFGH'[i]}${totalRow}` })),
  );
  breakdown('By category', totalsBy(lines, 'category').map(({ key, amount }) => ({ label: categoryName(key), amount })));
  breakdown('By book', totalsBy(lines, 'book').map(({ key, amount }) => ({ label: key, sub: BOOK_LABEL[key] || '', amount })));

  const summary = {
    name: 'Summary',
    tabColor: 'F7EB22',
    gridLines: false,
    fitToWidth: true,
    merges,
    rowHeights: { 1: 28 },
    columns: [{ width: 20 }, { width: 30 }, { width: 16 }, { width: 9 }, { width: 24 }],
    rows,
  };

  const history = {
    name: 'Approval history',
    tabColor: '1E6B4A',
    freezeRows: 3,
    merges: ['A1:D1'],
    rowHeights: { 1: 26 },
    columns: [{ width: 22 }, { width: 14 }, { width: 22 }, { width: 50 }],
    rows: [
      [{ v: 'Approval history', style: 'title' }],
      [],
      ['When', 'Status', 'By', 'Note'].map((v) => ({ v, style: 'header' })),
      ...(budget.history || []).map((h) => [
        { v: formatDateTime(h.at), style: 'text' },
        { v: statusLabel(h.status), style: STATUS_TONE[h.status] === 'neutral' ? 'bold' : STATUS_TONE[h.status] || 'bold' },
        { v: h.by || '', style: 'text' },
        { v: h.note || '', style: 'text' },
      ]),
    ],
  };

  return [summary, linesSheet, history];
}

// ── CSV (this budget's lines) ───────────────────────────────────────────────

/** Lines with readable headers, share of the budget, and a Total row — for opening in a spreadsheet. */
export function budgetLinesSheetCsv(budget) {
  const lines = budget.lines || [];
  const total = budgetTotal(lines);
  const q = quarterTotals(lines);
  const categoryName = categoryOf(budget);
  const rows = [
    ...lines.map((l) => ({
      line: l.lineCode,
      category: l.categoryName || categoryName(l.category),
      description: l.description,
      book: l.book,
      ...Object.fromEntries(QUARTERS.map((x) => [x.key, Number(l[x.key]) || 0])),
      total: lineTotal(l),
      share: pctText(lineTotal(l), total),
    })),
    { line: 'Total', category: '', description: `${lines.length} ${lines.length === 1 ? 'line' : 'lines'}`, book: '', ...q, total, share: total ? '100%' : '' },
  ];
  return toCsv(
    [
      { header: 'Budget code', value: () => budget.budgetCode },
      { header: 'Budget', value: () => budget.name },
      { header: 'Financial year', value: () => `FY ${budget.financialYear}` },
      { header: 'Line', value: (r) => r.line },
      { header: 'Category', value: (r) => r.category },
      { header: 'Description', value: (r) => r.description },
      { header: 'Book', value: (r) => r.book },
      ...QUARTERS.map((x) => ({ header: `${x.label} (${x.months})`, value: (r) => r[x.key] })),
      { header: 'Line total', value: (r) => r.total },
      { header: 'Share of budget', value: (r) => r.share },
    ],
    rows,
  );
}

// ── Printable sheet (PDF) ───────────────────────────────────────────────────

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

/** A self-contained A4 page (inline CSS) for the browser to print or save as PDF. */
export function budgetSheetHtml(budget, { printedBy = '', printedAt = new Date() } = {}) {
  const lines = budget.lines || [];
  const total = budgetTotal(lines);
  const q = quarterTotals(lines);
  const categoryName = categoryOf(budget);
  const byCategory = totalsBy(lines, 'category');
  const byBook = totalsBy(lines, 'book');
  const [toneFg, toneBg] = TONE_CSS[STATUS_TONE[budget.status] || 'neutral'];
  const approved = approvedOn(budget);
  const lc = byBook.find((b) => b.key === 'LC')?.amount || 0;
  const fc = byBook.find((b) => b.key === 'FC')?.amount || 0;

  /** Rows of label · amount · share with a bar. */
  const bars = (items) =>
    items
      .map(
        (it) => `<div class="barrow"><div class="barlabel">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</div>
        <div class="bartrack"><div class="barfill" style="width:${Math.round(share(it.amount, total) * 100)}%"></div></div>
        <div class="baramt">${money(it.amount)}<small>${pctText(it.amount, total)}</small></div></div>`,
      )
      .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(budget.budgetCode)} — ${esc(budget.name)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; @bottom-left { content: "${String(budget.budgetCode || '').replace(/[^\w-]/g, '')} · Zariya budget sheet"; font: 8px sans-serif; color: #75705F; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8px sans-serif; color: #75705F; } }
  * { box-sizing: border-box; }
  body { font: 10.5px/1.45 "Segoe UI", Arial, sans-serif; color: #23241F; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { max-width: 186mm; margin: 0 auto; }
  .brand { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #F7EB22; padding-bottom: 6px; margin-bottom: 12px; }
  .brand b { font-size: 13px; letter-spacing: .02em; } .brand span { color: #75705F; font-size: 9.5px; }
  .eyebrow { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #75705F; }
  .titlerow { display: flex; align-items: center; gap: 10px; margin: 2px 0 10px; }
  h1 { font-size: 21px; margin: 0; }
  .status { padding: 3px 10px; border-radius: 12px; font-weight: 700; font-size: 10px; color: ${toneFg}; background: ${toneBg}; }
  .kpis { display: grid; grid-template-columns: 1.4fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
  .kpi { border: 1px solid #E4E0D4; border-radius: 6px; padding: 8px 10px; }
  .kpi span { display: block; color: #75705F; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
  .kpi b { font-size: 14px; } .kpi.main { background: #23241F; color: #fff; border-color: #23241F; } .kpi.main span { color: #F7EB22; } .kpi.main b { font-size: 18px; }
  .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 16px; padding: 8px 10px; background: #F1EEE6; border-radius: 6px; margin-bottom: 12px; }
  .meta div span { color: #75705F; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; margin-right: 6px; }
  h2 { font-size: 10.5px; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .08em; color: #23241F; border-left: 3px solid #1E6B4A; padding-left: 6px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .barrow { display: grid; grid-template-columns: 34% 1fr 26%; align-items: center; gap: 8px; padding: 3px 0; border-bottom: 1px solid #F1EEE6; }
  .barlabel small, .baramt small { display: block; color: #75705F; font-size: 8.5px; }
  .barlabel { font-weight: 600; } .baramt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  .bartrack { height: 7px; background: #F1EEE6; border-radius: 4px; overflow: hidden; } .barfill { height: 100%; background: #1E6B4A; border-radius: 4px; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: .05em; color: #fff; background: #23241F; padding: 5px 6px; }
  td { border-bottom: 1px solid #E4E0D4; padding: 5px 6px; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #FAF9F5; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .code { font-family: Consolas, monospace; font-weight: 700; }
  .muted { color: #75705F; font-size: 9px; }
  .book { display: inline-block; padding: 0 6px; border-radius: 8px; font-size: 9px; font-weight: 700; background: #F1EEE6; }
  tfoot td { font-weight: 700; background: #F1EEE6; border-top: 2px solid #23241F; border-bottom: none; }
  .timeline { margin: 0; padding: 0; list-style: none; }
  .timeline li { display: grid; grid-template-columns: 14px 120px 80px 1fr; gap: 8px; padding: 5px 0; border-bottom: 1px solid #F1EEE6; align-items: baseline; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
  .sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 30px; page-break-inside: avoid; }
  .sign div { border-top: 1px solid #23241F; padding-top: 4px; font-size: 9.5px; color: #23241F; }
  .sign small { display: block; color: #75705F; margin-top: 12px; }
  .foot { margin-top: 14px; font-size: 8.5px; color: #75705F; }
  tr, .barrow, .kpi { page-break-inside: avoid; }
  @media screen { body { background: #EFEDE6; } .wrap { background: #fff; padding: 12mm; margin: 10mm auto; box-shadow: 0 1px 8px rgba(0,0,0,.12); } }
</style></head>
<body><div class="wrap">
  <div class="brand"><b>Zariya · Budget sheet</b><span>Printed ${esc(formatDate(printedAt))}${printedBy ? ` by ${esc(printedBy)}` : ''}</span></div>
  <div class="eyebrow">${esc(budget.budgetCode)} · FY ${esc(budget.financialYear)} · ${esc(BUDGET_TYPE[budgetTypeOf(budget)] || '')}</div>
  <div class="titlerow"><h1>${esc(budget.name)}</h1><span class="status">${esc(statusLabel(budget.status))}</span></div>

  <div class="kpis">
    <div class="kpi main"><span>Total budget</span><b>${money(total)}</b></div>
    <div class="kpi"><span>Budget lines</span><b>${lines.length}</b></div>
    <div class="kpi"><span>LC · FC</span><b>${pctText(lc, total)} · ${pctText(fc, total)}</b></div>
    <div class="kpi"><span>${approved ? 'Approved on' : 'Status'}</span><b>${esc(approved ? formatDate(approved) : statusLabel(budget.status))}</b></div>
  </div>

  <div class="meta">
    ${details(budget)
      .filter(([label]) => !['Budget code', 'Financial year'].includes(label))
      .map(([label, value]) => `<div><span>${esc(label)}</span>${esc(value)}</div>`)
      .join('')}
  </div>

  <h2>Quarterly phasing</h2>
  ${bars(QUARTERS.map((x) => ({ label: x.label, sub: x.months, amount: q[x.key] })))}

  <div class="two">
    <div><h2>By category</h2>${bars(byCategory.map(({ key, amount }) => ({ label: categoryName(key), amount })))}</div>
    <div><h2>By book</h2>${bars(byBook.map(({ key, amount }) => ({ label: key, sub: BOOK_LABEL[key], amount })))}</div>
  </div>

  <h2>Budget lines · ${lines.length}</h2>
  <table>
    <thead><tr><th>Line</th><th>Description · category</th><th>Book</th>${QUARTERS.map((x) => `<th class="r">${x.label}</th>`).join('')}<th class="r">Total</th><th class="r">Share</th></tr></thead>
    <tbody>
    ${lines
      .map(
        (l) => `<tr><td class="code">${esc(l.lineCode)}</td><td>${esc(l.description)}<div class="muted">${esc(l.categoryName || categoryName(l.category))}</div></td><td><span class="book">${esc(l.book)}</span></td>${QUARTERS.map((x) => `<td class="r">${l[x.key] ? money(l[x.key]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="r"><b>${money(lineTotal(l))}</b></td><td class="r muted">${pctText(lineTotal(l), total)}</td></tr>`,
      )
      .join('')}
    </tbody>
    <tfoot><tr><td colspan="3">Total · ${lines.length} ${lines.length === 1 ? 'line' : 'lines'}</td>${QUARTERS.map((x) => `<td class="r">${money(q[x.key])}</td>`).join('')}<td class="r">${money(total)}</td><td class="r">100%</td></tr></tfoot>
  </table>

  <h2>Approval history</h2>
  <ul class="timeline">
  ${(budget.history || [])
    .map((h) => {
      const [fg] = TONE_CSS[STATUS_TONE[h.status] || 'neutral'];
      return `<li><span class="dot" style="background:${fg}"></span><span>${esc(formatDateTime(h.at))}</span><b style="color:${fg}">${esc(statusLabel(h.status))}</b><span>${esc(h.by || '')}${h.note ? ` — <span class="muted">${esc(h.note)}</span>` : ''}</span></li>`;
    })
    .join('') || '<li><span></span><span class="muted">No history</span></li>'}
  </ul>

  <div class="sign">
    <div>Prepared by<small>Name &amp; date</small></div>
    <div>Reviewed by<small>Name &amp; date</small></div>
    <div>Approved by<small>Name &amp; date</small></div>
  </div>
  <div class="foot">${esc(budget.budgetCode)} · generated from Zariya — figures as on ${esc(formatDate(printedAt))}.</div>
</div></body></html>`;
}

/** Opens the sheet in a new window and starts printing (Save as PDF). Returns false if the window was blocked. */
export function printBudgetSheet(budget, options) {
  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.open();
  w.document.write(budgetSheetHtml(budget, options));
  w.document.close();
  w.focus();
  // Give the new page a moment to lay out before the print dialog opens.
  setTimeout(() => w.print(), 300);
  return true;
}
