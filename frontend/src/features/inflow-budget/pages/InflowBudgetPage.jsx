import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Divider,
  FormControl,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  TableCell,
  TableFooter,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNavigate } from 'react-router-dom';
import { downloadCsv } from '../../../lib/export/csv.js';
import { inflowReceiptsCsv, inflowTranchesCsv } from '../lib/inflowExport.js';
import { DataTable, PageHeader, SearchField, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { BOOK } from '../../../shared/constants/book.js';
import { QUARTERS } from '../../budget/constants.js';
import { financialYearOf } from '../../budget/lib/financialYear.js';
import { useInflowBudgetLines } from '../hooks/useInflowBudget.js';
import { toInflowView } from '../lib/inflowView.js';
import { printHtml, scheduleSheetHtml, scheduleWorkbook } from '../lib/inflowSheet.js';
import { downloadXlsx } from '../../../lib/export/xlsx.js';
import { useAuth } from '../../../core/auth/index.js';
import { FUNDING_SOURCE_TYPE, OVERDUE_THRESHOLD_DAYS, RECEIPT_STATUS, RECEIPT_STATUS_TONE } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const sumOf = (list, pick) => list.reduce((s, r) => s + pick(r), 0);

/** Status code (RECEIVED…) for a status label ("Received"…) — the tone map is keyed by code. */
const STATUS_CODE = Object.fromEntries(Object.entries(RECEIPT_STATUS).map(([code, label]) => [label, code]));
const toneOf = (label) => RECEIPT_STATUS_TONE[STATUS_CODE[label]];

/** Funding source as a coloured dot (restricted money stands out). */
const SOURCE_COLOR = { RESTRICTED: 'var(--warn)', UNRESTRICTED: 'var(--muted)', CORPUS: 'var(--info)' };

/** Status tabs, most urgent first. */
const STATUS_TABS = [
  { code: 'All', label: 'All' },
  { code: RECEIPT_STATUS.OVERDUE, label: 'Overdue', color: 'var(--err)', hint: `${OVERDUE_THRESHOLD_DAYS}+ days past the expected date` },
  { code: RECEIPT_STATUS.PENDING, label: 'Pending', color: 'var(--warn)', hint: `1–${OVERDUE_THRESHOLD_DAYS} days past the expected date` },
  { code: RECEIPT_STATUS.DUE, label: 'Due', color: 'var(--muted)', hint: 'Expected date not reached yet' },
  { code: RECEIPT_STATUS.RECEIVED, label: 'Received', color: 'var(--ok)', hint: 'Receipt recorded' },
];


/** Segmented tabs with a count (and optional coloured dot) per tab. */
function Tabs({ label, items, value, onChange }) {
  return (
    <Box
      role="tablist"
      aria-label={label}
      sx={{
        display: 'inline-flex',
        p: 0.5,
        gap: 0.25,
        borderRadius: 2,
        bgcolor: 'var(--card2)',
        border: '1px solid',
        borderColor: 'divider',
        overflowX: 'auto',
        maxWidth: '100%',
      }}
    >
      {items.map((item) => {
        const selected = value === item.code;
        return (
          // describeChild: the hint describes the tab; the tab's own text stays its accessible name.
          <Tooltip key={item.code} title={item.hint || ''} disableHoverListener={!item.hint} describeChild>
            <Box
              component="button"
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(item.code)}
              sx={{
                font: 'inherit',
                border: 0,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.5,
                py: 0.6,
                borderRadius: 1.5,
                fontSize: 13,
                fontWeight: selected ? 700 : 500,
                whiteSpace: 'nowrap',
                color: selected ? 'text.primary' : 'text.secondary',
                bgcolor: selected ? 'background.paper' : 'transparent',
                boxShadow: selected ? 'var(--shadow)' : 'none',
                '&:hover': { color: 'text.primary' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
              }}
            >
              {item.color ? <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: item.color }} /> : null}
              {item.label}
              {item.count != null ? (
                <Box component="span" sx={{ ...MONEY_SX, fontSize: 11.5, color: 'text.secondary', fontWeight: 500 }}>
                  {item.count}
                </Box>
              ) : null}
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}

/** Footer of the KPI strip: one column per quarter — expected vs received. */
function QuarterFooter({ quarters }) {
  return (
    <Box
      sx={{
        borderTop: '1px solid',
        borderColor: 'divider',
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        '& > *': { px: 2.5, py: 1.5 },
        '& > *:not(:last-child)': { borderRight: { md: '1px solid' }, borderColor: { md: 'divider' } },
      }}
    >
      {quarters.map((q) => {
        const share = pct(q.received, q.expected);
        return (
          <Box key={q.key} sx={{ minWidth: 0 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {q.label} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· {q.months}</Box>
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10.5 }}>
                {q.count} {q.count === 1 ? 'tranche' : 'tranches'}
              </Typography>
            </Stack>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${Math.min(100, share)}%`, bgcolor: 'var(--ok)', borderRadius: 3 }} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ...MONEY_SX, display: 'block', mt: 0.5 }}>
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{formatInr(q.received)}</Box> of {formatInr(q.expected)} · {share}%
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/** Inflow schedule — /inflow-budget. One row per grant tranche; receipts are recorded on the row. */
export function InflowBudgetPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const linesQuery = useInflowBudgetLines();
  const rows = useMemo(() => linesQuery.data || [], [linesQuery.data]);
  const asAt = useMemo(() => new Date(), []);

  const allRows = useMemo(() => rows.map((row) => toInflowView(row, asAt)), [rows, asAt]);

  // Year: the current FY when it has tranches, else all years. Years come from the tranches' expected dates.
  const fyOptions = useMemo(() => [...new Set(allRows.map((r) => r.fy).filter(Boolean))].sort(), [allRows]);
  const currentFy = financialYearOf(asAt);
  const [fyChoice, setFyChoice] = useState(null);
  const fy = fyChoice ?? (fyOptions.includes(currentFy) ? currentFy : 'All');
  const yearRows = useMemo(() => allRows.filter((r) => fy === 'All' || r.fy === fy), [allRows, fy]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [quarterFilter, setQuarterFilter] = useState('All');
  const [bookFilter, setBookFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return yearRows.filter((row) => {
      const matchesSearch =
        !q || [row.trancheCode, row.profileCode, row.line, row.donor, String(row.id)].some((t) => (t || '').toLowerCase().includes(q));
      return (
        matchesSearch &&
        (statusFilter === 'All' || row.status === statusFilter) &&
        (quarterFilter === 'All' || row.quarter === quarterFilter) &&
        (bookFilter === 'All' || row.book === bookFilter) &&
        (sourceFilter === 'All' || row.fundingSource === sourceFilter)
      );
    });
  }, [yearRows, searchQuery, statusFilter, quarterFilter, bookFilter, sourceFilter]);

  const filtersActive =
    Boolean(searchQuery.trim()) || statusFilter !== 'All' || quarterFilter !== 'All' || bookFilter !== 'All' || sourceFilter !== 'All';
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setQuarterFilter('All');
    setBookFilter('All');
    setSourceFilter('All');
  };

  // KPIs describe the whole selected year (not the table filters).
  const kpis = useMemo(() => {
    const expected = sumOf(yearRows, (r) => r.expected);
    const received = sumOf(yearRows, (r) => r.received);
    const overdueRows = yearRows.filter((r) => r.status === RECEIPT_STATUS.OVERDUE);
    const pendingRows = yearRows.filter((r) => r.status === RECEIPT_STATUS.PENDING);
    const receivedRows = yearRows.filter((r) => r.status === RECEIPT_STATUS.RECEIVED);
    const onTime = receivedRows.filter((r) => r.actualDate && new Date(r.actualDate) <= new Date(r.expectedDate)).length;
    return {
      expected,
      received,
      outstanding: sumOf(yearRows, (r) => r.outstanding),
      overdue: sumOf(overdueRows, (r) => r.outstanding),
      overdueCount: overdueRows.length,
      pending: sumOf(pendingRows, (r) => r.outstanding),
      pendingCount: pendingRows.length,
      receivedCount: receivedRows.length,
      onTime,
      quarters: QUARTERS.map((q) => {
        const inQ = yearRows.filter((r) => r.quarter === q.key);
        return { ...q, expected: sumOf(inQ, (r) => r.expected), received: sumOf(inQ, (r) => r.received), count: inQ.length };
      }),
    };
  }, [yearRows]);

  const statusTabs = STATUS_TABS.map((t) => ({
    ...t,
    count: t.code === 'All' ? yearRows.length : yearRows.filter((r) => r.status === t.code).length,
  }));
  const quarterTabs = [
    { code: 'All', label: 'All quarters' },
    ...QUARTERS.map((q) => ({ code: q.key, label: q.label, hint: q.months })),
  ];

  const columns = [
    {
      key: 'tranche',
      header: 'Tranche',
      sortValue: (row) => row.trancheCode || row.id,
      render: (row) => (
        <Box sx={{ minWidth: 200, maxWidth: 300 }}>
          <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>{row.line}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {row.trancheCode || row.id} ·{' '}
            <Tooltip title={BOOK[row.book] || ''} describeChild>
              <Box component="span" sx={{ fontWeight: 700, color: row.book === 'FC' ? 'text.primary' : 'text.secondary' }}>{row.book}</Box>
            </Tooltip>
          </Typography>
        </Box>
      ),
    },
    {
      key: 'donor',
      header: 'Donor · source',
      sortValue: (row) => row.donor,
      render: (row) => (
        <Box sx={{ minWidth: 150, maxWidth: 220 }} title={row.donor || ''}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.35 }}>{row.donor || '—'}</Typography>
          <Stack direction="row" spacing={0.6} alignItems="center" sx={{ mt: 0.25 }}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: SOURCE_COLOR[row.fundingSource] || 'var(--muted)' }} />
            <Typography variant="caption" color="text.secondary">{FUNDING_SOURCE_TYPE[row.fundingSource] || row.fundingSource}</Typography>
          </Stack>
        </Box>
      ),
    },
    {
      key: 'expectedDate',
      header: 'Expected',
      sortValue: (row) => row.expectedDate,
      render: (row) => {
        const q = QUARTERS.find((x) => x.key === row.quarter);
        const received = row.status === RECEIPT_STATUS.RECEIVED;
        const lateColor = row.status === RECEIPT_STATUS.OVERDUE ? 'error.main' : row.status === RECEIPT_STATUS.PENDING ? 'warning.main' : 'text.secondary';
        return (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
              {q ? <Box component="span" sx={{ fontWeight: 700 }}>{q.label} · </Box> : null}
              {formatDate(row.expectedDate)}
            </Typography>
            <Typography variant="caption" sx={{ color: received ? 'success.main' : lateColor }}>
              {received
                ? `Received ${formatDate(row.actualDate)}`
                : row.daysLate
                  ? `${row.daysLate} ${row.daysLate === 1 ? 'day' : 'days'} late`
                  : 'On track'}
            </Typography>
          </Box>
        );
      },
    },
    {
      key: 'expected',
      header: 'Expected',
      align: 'right',
      sortValue: (row) => row.expected,
      render: (row) => <Box sx={{ ...MONEY_SX, fontWeight: 600 }}>{formatInrExact(row.expected)}</Box>,
    },
    {
      key: 'received',
      header: 'Received',
      align: 'right',
      sortValue: (row) => row.received,
      // Amount and a bar for how much of the tranche has come in (can exceed 100%).
      render: (row) => {
        const share = pct(row.received, row.expected);
        return (
          <Box sx={{ minWidth: 84, ml: 'auto' }}>
            <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: row.received ? 600 : 400, color: row.received ? 'success.main' : 'text.disabled' }}>
              {row.received ? formatInrExact(row.received) : '—'}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
              <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${Math.min(100, share)}%`, bgcolor: 'var(--ok)' }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ ...MONEY_SX, width: 32, textAlign: 'right' }}>{share}%</Typography>
            </Stack>
          </Box>
        );
      },
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortValue: (row) => row.outstanding,
      render: (row) => (
        <Box sx={{ ...MONEY_SX, color: row.outstanding ? 'text.primary' : 'text.secondary', fontWeight: row.outstanding ? 600 : 400 }}>
          {row.outstanding ? formatInrExact(row.outstanding) : '—'}
        </Box>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => [RECEIPT_STATUS.OVERDUE, RECEIPT_STATUS.PENDING, RECEIPT_STATUS.DUE, RECEIPT_STATUS.RECEIVED].indexOf(row.status),
      render: (row) => <StatusChip label={row.status} tone={toneOf(row.status)} />,
    },
  ];

  const footer =
    filteredRows.length > 0 ? (
      <TableFooter>
        <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
          <TableCell colSpan={3} sx={{ fontWeight: 600 }}>
            Total · {filteredRows.length} {filteredRows.length === 1 ? 'tranche' : 'tranches'}
            {filtersActive ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (filtered from {yearRows.length})
              </Typography>
            ) : null}
          </TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(sumOf(filteredRows, (r) => r.expected))}</TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(sumOf(filteredRows, (r) => r.received))}</TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(sumOf(filteredRows, (r) => r.outstanding))}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    ) : null;

  const fyLabel = fy === 'All' ? 'all years' : `FY ${fy}`;

  // Export what's shown (year + filters): one row per tranche, or one row per receipt.
  const [exportAnchor, setExportAnchor] = useState(null);
  const fileTag = `${fy === 'All' ? 'all-years' : `fy-${fy}`}-${asAt.toLocaleDateString('en-CA')}`;
  const [exportNote, setExportNote] = useState(null);
  const exportAs = (kind) => {
    setExportAnchor(null);
    setExportNote(null);
    const sheetFy = fy === 'All' ? 'All years' : `FY ${fy}`;
    if (kind === 'pdf') {
      const filterNote = filtersActive ? `filtered: ${filteredRows.length} of ${yearRows.length} tranches` : '';
      if (!printHtml(scheduleSheetHtml(filteredRows, { fyLabel: sheetFy, filterNote, printedBy: user?.name, printedAt: asAt }))) {
        setExportNote('Your browser blocked the new window — allow pop-ups for this site and try again.');
      }
    } else if (kind === 'xlsx') {
      downloadXlsx(`inflow-schedule-${fileTag}.xlsx`, scheduleWorkbook(filteredRows, { fyLabel: sheetFy, asAt }));
    } else if (kind === 'receipts') {
      downloadCsv(`inflow-receipts-${fileTag}.csv`, inflowReceiptsCsv(filteredRows));
    } else {
      downloadCsv(`inflow-tranches-${fileTag}.csv`, inflowTranchesCsv(filteredRows));
    }
  };
  const receiptCount = filteredRows.reduce((n, r) => n + (r.receipts || []).length, 0);

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        eyebrow={fy === 'All' ? 'All financial years' : `FY ${fy}${fy === currentFy ? ' · current year' : ''}`}
        title="Inflow budget"
        subtitle="Expected vs received for every grant tranche. Tranches come from funding agreements — open a row to record what comes in: date, amount, receipt reference and any variance reason."
      />

      <StatStrip
        sx={{ mb: 3 }}
        stats={[
          {
            label: `Expected · ${fyLabel}`,
            value: formatInr(kpis.expected),
            note: `${yearRows.length} ${yearRows.length === 1 ? 'tranche' : 'tranches'}`,
          },
          {
            label: 'Received',
            value: formatInr(kpis.received),
            note: `${pct(kpis.received, kpis.expected)}% of expected · ${kpis.onTime} of ${kpis.receivedCount} on time`,
            color: 'success.main',
          },
          {
            label: 'Outstanding',
            value: formatInr(kpis.outstanding),
            note: `still to come in · as at ${formatDate(asAt)}`,
          },
          {
            label: 'Overdue',
            value: formatInr(kpis.overdue),
            note: `${kpis.overdueCount} ${kpis.overdueCount === 1 ? 'tranche' : 'tranches'}${kpis.pendingCount ? ` · ${kpis.pendingCount} pending (${formatInr(kpis.pending)})` : ''}`,
            color: kpis.overdueCount ? 'error.main' : undefined,
          },
        ]}
        footer={yearRows.length ? <QuarterFooter quarters={kpis.quarters} /> : null}
      />

      {/* Row 1: status and quarter tabs. Row 2: search and the year / source / book filters. */}
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Tabs label="Filter by status" items={statusTabs} value={statusFilter} onChange={setStatusFilter} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <Tabs label="Filter by quarter" items={quarterTabs} value={quarterFilter} onChange={setQuarterFilter} />
          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={(e) => setExportAnchor(e.currentTarget)}
            disabled={!filteredRows.length}
            aria-haspopup="menu"
            sx={{ whiteSpace: 'nowrap', height: 36 }}
          >
            Export {filteredRows.length}
          </Button>
          <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={() => exportAs('pdf')}>
              <ListItemIcon><PictureAsPdfOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Schedule report (PDF)" secondary="Landscape A4 — key figures, by quarter and status, every tranche" />
            </MenuItem>
            <MenuItem onClick={() => exportAs('xlsx')}>
              <ListItemIcon><GridOnOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Excel workbook (.xlsx)" secondary="Summary dashboard, tranches with formulas and filters, receipts" />
            </MenuItem>
            <Divider />
            <MenuItem onClick={() => exportAs('tranches')}>
              <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary="Tranches (CSV)" secondary="One row per tranche — expected, received, outstanding, status, FX" />
            </MenuItem>
            <MenuItem onClick={() => exportAs('receipts')} disabled={!receiptCount}>
              <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
              <ListItemText primary={`Receipts (CSV) · ${receiptCount}`} secondary="One row per credit note received — date, UTR, amount" />
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>
      <Stack
        direction="row"
        sx={{ mb: 1.5, gap: 1, alignItems: 'center', flexWrap: 'wrap', '& .MuiInputBase-root': { height: 36, fontSize: 13 } }}
      >
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 280px' }, maxWidth: { sm: 380 } }}>
          <SearchField placeholder="Search tranche, donor or description…" value={searchQuery} onChange={setSearchQuery} />
        </Box>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select value={fy} onChange={(e) => setFyChoice(e.target.value)} inputProps={{ 'aria-label': 'Financial year' }}>
            {fyOptions.map((label) => (
              <MenuItem key={label} value={label}>
                FY {label}{label === currentFy ? ' (current)' : ''}
              </MenuItem>
            ))}
            <MenuItem value="All">All FYs</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} inputProps={{ 'aria-label': 'Funding source' }}>
            <MenuItem value="All">All funding sources</MenuItem>
            {Object.entries(FUNDING_SOURCE_TYPE).map(([code, label]) => (
              <MenuItem key={code} value={code}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select value={bookFilter} onChange={(e) => setBookFilter(e.target.value)} inputProps={{ 'aria-label': 'Book' }}>
            <MenuItem value="All">All books</MenuItem>
            {Object.entries(BOOK).map(([code, label]) => (
              <MenuItem key={code} value={code}>{code} · {label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {filtersActive ? (
          <Typography
            component="button"
            type="button"
            onClick={clearFilters}
            sx={{ font: 'inherit', fontSize: 13, border: 0, bgcolor: 'transparent', color: 'text.secondary', cursor: 'pointer', px: 1, '&:hover': { color: 'text.primary' } }}
          >
            Clear filters
          </Typography>
        ) : null}
      </Stack>

      {exportNote ? (
        <Typography variant="body2" color="warning.main" sx={{ mb: 1 }}>{exportNote}</Typography>
      ) : null}

      <DataTable
        dense
        columns={columns}
        rows={filteredRows}
        getRowKey={(row) => row.id}
        isLoading={linesQuery.isPending}
        error={linesQuery.isError ? linesQuery.error : null}
        onRetry={linesQuery.refetch}
        defaultSort={{ key: 'expectedDate', direction: 'asc' }}
        footer={footer}
        emptyTitle={yearRows.length ? 'No tranches match these filters' : `No tranches expected in ${fyLabel}`}
        emptyDescription={yearRows.length ? 'Try clearing the filters.' : 'Tranches appear here from funding agreements.'}
        onRowClick={(row) => navigate(`/inflow-budget/${row.id}`)}
      />
    </Box>
  );
}
