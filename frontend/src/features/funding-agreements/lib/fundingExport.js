/**
 * The funding register → files, from the list page (what it shows: search + filters):
 *  - fundingCsv(rows):      one row per funding record, plain numbers
 *  - fundingWorkbook(rows): Excel — a Summary (key figures, by stage / class /
 *    donor with collected % and in-cell bars) and an Agreements sheet with
 *    outstanding and collected as formulas, a filter and a total row.
 * Rows are the page's rows: funding list items plus `received` (₹, from inflow).
 */
import { toCsv } from '../../../lib/export/csv.js';
import { formatDate } from '../../../lib/format/date.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { STAGES, STAGE_BY_KEY } from './fundingRecords.js';
import { CLASS_NAME } from '../constants.js';

const num = (v) => Number(v) || 0;
const committedOf = (r) => (r.hasSchedule ? num(r.committed) : 0);
const share = (part, whole) => (whole > 0 ? part / whole : 0);
const classLabel = (r) => (r.classCode ? `${r.classCode} · ${CLASS_NAME[r.classCode]}` : 'Not set');
const stageLabel = (r) => STAGE_BY_KEY[r.stage]?.label || r.stage || '';
/** Stage → xlsx style (the meaning colours). */
const STAGE_STYLE = { approved: 'ok', pending: 'warn', onhold: 'warn', completed: 'info', terms: 'bold' };

export function fundingCsv(rows) {
  return toCsv(
    [
      { header: 'funding_code', value: (r) => r.profileCode || '' },
      { header: 'agreement_code', value: (r) => r.grantCode || '' },
      { header: 'former_agreement_code', value: (r) => r.legacyCode || '' },
      { header: 'agreement', value: (r) => r.title || '' },
      { header: 'donor', value: (r) => r.donorName || '' },
      { header: 'programme', value: (r) => r.programmeName || '' },
      { header: 'class', value: classLabel },
      { header: 'start_date', value: (r) => r.startDate || '' },
      { header: 'end_date', value: (r) => r.endDate || '' },
      { header: 'committed', value: committedOf },
      { header: 'currency', value: (r) => r.currency || 'INR' },
      { header: 'foreign_amount', value: (r) => (r.foreignAmount != null ? num(r.foreignAmount) : '') },
      { header: 'received', value: (r) => num(r.received) },
      { header: 'outstanding', value: (r) => Math.max(0, committedOf(r) - num(r.received)) },
      { header: 'received_pct', value: (r) => Math.round(share(num(r.received), committedOf(r)) * 100) },
      { header: 'stage', value: stageLabel },
    ],
    rows,
  );
}

const BAR = (ref) => `REPT("█",ROUND(MIN(1,${ref})*20,0))`;
const barText = (f) => '█'.repeat(Math.max(0, Math.min(20, Math.round(f * 20))));

/** Sheets for lib/export/xlsx.js. */
export function fundingWorkbook(rows, { title = 'Funding agreements', asAt = new Date(), filterNote = '' } = {}) {
  const n = rows.length;
  const head = 4;
  const first = head + 1;
  const last = head + n;
  const totalRow = last + 1;
  const sum = (col) => (n ? `SUM(${col}${first}:${col}${last})` : '0');
  const committed = rows.reduce((s, r) => s + committedOf(r), 0);
  const received = rows.reduce((s, r) => s + num(r.received), 0);

  const agreements = {
    name: 'Agreements',
    tabColor: '23241F',
    freezeRows: head,
    autoFilter: `A${head}:M${Math.max(last, head)}`,
    landscape: true,
    fitToWidth: true,
    merges: ['A1:M1', 'A2:M2'],
    rowHeights: { 1: 26, [head]: 22 },
    columns: [
      { width: 14 }, { width: 16 }, { width: 40 }, { width: 28 }, { width: 26 }, { width: 22 },
      { width: 12 }, { width: 12 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 10 }, { width: 17 },
    ],
    rows: [
      [{ v: title, style: 'title' }],
      [{ v: `${n} funding record${n === 1 ? '' : 's'} · as at ${formatDate(asAt)}${filterNote ? ` · ${filterNote}` : ''}`, style: 'muted' }],
      [],
      [
        ...['Funding', 'Agreement no.', 'Agreement', 'Donor', 'Programme', 'Class', 'Start', 'End'].map((v) => ({ v, style: 'header' })),
        ...['Committed', 'Received', 'Outstanding', 'Collected'].map((v) => ({ v, style: 'headerRight' })),
        { v: 'Stage', style: 'header' },
      ],
      ...rows.map((r, i) => {
        const row = first + i;
        return [
          { v: r.profileCode || '', style: 'bold' },
          { v: r.grantCode || '—', style: 'text' },
          { v: r.title || 'No purpose recorded', style: 'text' },
          { v: r.donorName || '', style: 'text' },
          { v: r.programmeName || '', style: 'text' },
          { v: classLabel(r), style: 'text' },
          { v: r.startDate ? formatDate(r.startDate) : '—', style: 'text' },
          { v: r.endDate ? formatDate(r.endDate) : '—', style: 'text' },
          { v: committedOf(r), style: 'inr' },
          { v: num(r.received), style: 'inr' },
          { f: `MAX(0,I${row}-J${row})`, v: Math.max(0, committedOf(r) - num(r.received)), style: 'boldInr' },
          { f: `IF(I${row}=0,0,J${row}/I${row})`, v: share(num(r.received), committedOf(r)), style: 'pct' },
          { v: stageLabel(r), style: STAGE_STYLE[r.stage] || 'bold' },
        ];
      }),
      [
        { v: `Total · ${n}`, style: 'totalLabel' },
        ...Array.from({ length: 7 }, () => ({ v: '', style: 'totalBlank' })),
        { f: sum('I'), v: committed, style: 'totalInr' },
        { f: sum('J'), v: received, style: 'totalInr' },
        { f: sum('K'), v: rows.reduce((s, r) => s + Math.max(0, committedOf(r) - num(r.received)), 0), style: 'totalInr' },
        { f: `IF(I${totalRow}=0,0,J${totalRow}/I${totalRow})`, v: share(received, committed), style: 'totalPct' },
        { v: '', style: 'totalBlank' },
      ],
    ],
  };

  // ── Summary dashboard
  const s = [];
  s.push([{ v: title, style: 'title' }]);
  s.push([{ v: `As at ${formatDate(asAt)}${filterNote ? ` · ${filterNote}` : ''}`, style: 'muted' }]);
  s.push([]);
  s.push([{ v: 'Committed', style: 'label' }, { f: `Agreements!$I$${totalRow}`, v: committed, style: 'bigInr' }]);
  s.push([{ v: 'Received', style: 'label' }, { f: `Agreements!$J$${totalRow}`, v: received, style: 'bigInr' }]);
  s.push([{ v: 'Outstanding', style: 'label' }, { f: `Agreements!$K$${totalRow}`, v: Math.max(0, committed - received), style: 'bigInr' }]);
  s.push([{ v: 'Collected', style: 'label' }, { f: `Agreements!$L$${totalRow}`, v: share(received, committed), style: 'pct' }]);
  s.push([{ v: 'Funding records', style: 'label' }, { v: n, style: 'bold' }]);
  const foreign = Object.entries(
    rows.reduce((acc, r) => {
      if (r.currency && r.foreignAmount != null) acc[r.currency] = (acc[r.currency] || 0) + num(r.foreignAmount);
      return acc;
    }, {}),
  );
  if (foreign.length) s.push([{ v: 'Foreign committed', style: 'label' }, { v: foreign.map(([c, a]) => formatForeign(c, a)).join(' · '), style: 'bold' }]);
  s.push([]);

  const breakdown = (heading, groups) => {
    s.push([{ v: heading, style: 'section' }]);
    s.push([
      { v: '', style: 'header' },
      { v: '', style: 'header' },
      { v: 'Committed', style: 'headerRight' },
      { v: 'Received', style: 'headerRight' },
      { v: 'Collected', style: 'headerRight' },
      { v: '', style: 'header' },
    ]);
    const start = s.length + 1;
    for (const g of groups) {
      const r = s.length + 1;
      s.push([
        { v: g.label, style: g.style || 'bold' },
        { v: `${g.count} record${g.count === 1 ? '' : 's'}`, style: 'label' },
        { v: g.committed, style: 'inr' },
        { v: g.received, style: 'inr' },
        { f: `IF(C${r}=0,0,D${r}/C${r})`, v: share(g.received, g.committed), style: 'pct' },
        { f: BAR(`E${r}`), v: barText(share(g.received, g.committed)), style: 'bar' },
      ]);
    }
    const end = s.length;
    s.push([
      { v: 'Total', style: 'totalLabel' },
      { v: '', style: 'totalBlank' },
      { f: groups.length ? `SUM(C${start}:C${end})` : '0', v: groups.reduce((a, g) => a + g.committed, 0), style: 'totalInr' },
      { f: groups.length ? `SUM(D${start}:D${end})` : '0', v: groups.reduce((a, g) => a + g.received, 0), style: 'totalInr' },
      { f: `IF(C${end + 1}=0,0,D${end + 1}/C${end + 1})`, v: share(received, committed), style: 'totalPct' },
      { v: '', style: 'totalBlank' },
    ]);
    s.push([]);
  };
  const group = (keyOf, keys, labelOf, styleOf) =>
    keys
      .map((k) => {
        const inK = rows.filter((r) => keyOf(r) === k);
        return {
          label: labelOf(k),
          style: styleOf?.(k),
          count: inK.length,
          committed: inK.reduce((a, r) => a + committedOf(r), 0),
          received: inK.reduce((a, r) => a + num(r.received), 0),
        };
      })
      .filter((g) => g.count);

  breakdown('By stage', group((r) => r.stage, STAGES.map((st) => st.key), (k) => STAGE_BY_KEY[k].label, (k) => STAGE_STYLE[k]));
  breakdown('By class', group((r) => r.classCode || 'none', ['A', 'B', 'C', 'none'], (k) => (k === 'none' ? 'Class not set' : `${k} · ${CLASS_NAME[k]}`)));
  const donors = [...new Set(rows.map((r) => r.donorName || '—'))];
  breakdown('By donor', group((r) => r.donorName || '—', donors, (k) => k).sort((a, b) => b.committed - a.committed));

  const summary = {
    name: 'Summary',
    tabColor: 'F7EB22',
    gridLines: false,
    fitToWidth: true,
    merges: ['A1:F1', 'A2:F2'],
    rowHeights: { 1: 28 },
    columns: [{ width: 30 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 22 }],
    rows: s,
  };
  return [summary, agreements];
}
