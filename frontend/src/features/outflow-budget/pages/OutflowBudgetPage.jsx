import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
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
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useNavigate } from 'react-router-dom';
import { downloadCsv } from '../../../lib/export/csv.js';
import { outflowRowsCsv } from '../lib/outflowExport.js';
import { DataTable, PageHeader, SearchField, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { BOOK } from '../../../shared/constants/book.js';
import { useOutflowRows } from '../hooks/useOutflow.js';
import { useBudgetFinancialYears } from '../../budget/hooks/useBudgets.js';
import { BUDGET_TYPE, QUARTERS } from '../../budget/constants.js';
import { BUDGET_TYPE_ICON } from '../../budget/components/budgetTypeIcons.js';
import { OVERDUE_THRESHOLD_DAYS, PAYMENT_STATUS, PAYMENT_STATUS_TONE } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };
const DAY = 24 * 60 * 60 * 1000;
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const sumOf = (list, pick) => list.reduce((s, r) => s + pick(r), 0);

/** Status tabs, most urgent first; each says what still has to go out (or what was spent). */
const STATUS_TABS = [
  { code: 'All', label: 'All' },
  { code: 'OVERDUE', label: 'Overdue', color: 'var(--err)', hint: `${OVERDUE_THRESHOLD_DAYS}+ days past the quarter's end` },
  { code: 'PENDING', label: 'Pending', color: 'var(--warn)', hint: `1–${OVERDUE_THRESHOLD_DAYS} days past the quarter's end` },
  { code: 'DUE', label: 'Due', color: 'var(--muted)', hint: 'Quarter not ended yet' },
  { code: 'PAID', label: 'Fully spent', color: 'var(--ok)', hint: 'Debit notes cover the budgeted amount' },
];

/** Days a row is past its due date (0 if not yet due). */
const daysLate = (row) => {
  if (!row.expectedDate) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(row.expectedDate).getTime()) / DAY));
};

/** A quarter ending on `end` is closed, current or upcoming relative to today. */
const quarterPhase = (end) => {
  if (!end) return null;
  const t = new Date(end).getTime();
  if (t < Date.now()) return 'Closed';
  if (t - 92 * DAY <= Date.now()) return 'Current';
  return 'Upcoming';
};

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

/** Footer of the KPI strip: one column per quarter — budgeted vs spent, with where the quarter stands. */
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
        const share = pct(q.spent, q.budgeted);
        const phaseColor = { Closed: 'text.secondary', Current: 'info.main', Upcoming: 'text.disabled' }[q.phase] || 'text.secondary';
        return (
          <Box key={q.key} sx={{ minWidth: 0 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {q.label} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>· {q.months}</Box>
              </Typography>
              {q.phase ? (
                <Typography variant="caption" sx={{ color: phaseColor, fontWeight: 600, fontSize: 10.5 }}>{q.phase}</Typography>
              ) : null}
            </Stack>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${Math.min(100, share)}%`, bgcolor: 'var(--err)', borderRadius: 3 }} />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ ...MONEY_SX, display: 'block', mt: 0.5 }}>
              <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{formatInr(q.spent)}</Box> of {formatInr(q.budgeted)} · {share}%
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/** Outflow schedule — /outflow-budget. Rows come from APPROVED budgets; Spent = debit notes. */
export function OutflowBudgetPage() {
  const navigate = useNavigate();
  const fyMaster = useBudgetFinancialYears();
  const [fyChoice, setFyChoice] = useState(null); // null → the year running today
  const fy = fyChoice ?? fyMaster.activeLabel ?? 'All';
  const rowsQuery = useOutflowRows(fy === 'All' ? undefined : fy);
  const rows = useMemo(() => rowsQuery.data || [], [rowsQuery.data]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [quarterFilter, setQuarterFilter] = useState('All');
  const [bookFilter, setBookFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        [row.budgetCode, row.lineCode, row.line, row.budgetName, row.scope, row.categoryName, row.stateName].some((t) =>
          (t || '').toLowerCase().includes(q),
        );
      return (
        matchesSearch &&
        (statusFilter === 'All' || row.status === statusFilter) &&
        (quarterFilter === 'All' || `q${row.quarter}` === quarterFilter) &&
        (bookFilter === 'All' || row.book === bookFilter) &&
        (typeFilter === 'All' || row.budgetType === typeFilter)
      );
    });
  }, [rows, searchQuery, statusFilter, quarterFilter, bookFilter, typeFilter]);

  const filtersActive =
    Boolean(searchQuery.trim()) || statusFilter !== 'All' || quarterFilter !== 'All' || bookFilter !== 'All' || typeFilter !== 'All';
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setQuarterFilter('All');
    setBookFilter('All');
    setTypeFilter('All');
  };

  // KPIs describe the whole selected year (not the table filters).
  const kpis = useMemo(() => {
    const budgeted = sumOf(rows, (r) => r.expectedAmount);
    const spent = sumOf(rows, (r) => r.spent);
    const overdueRows = rows.filter((r) => r.status === 'OVERDUE');
    const pendingRows = rows.filter((r) => r.status === 'PENDING');
    const quarters = QUARTERS.map((q, i) => {
      const inQ = rows.filter((r) => Number(r.quarter) === i + 1);
      return {
        ...q,
        budgeted: sumOf(inQ, (r) => r.expectedAmount),
        spent: sumOf(inQ, (r) => r.spent),
        phase: quarterPhase(inQ[0]?.expectedDate),
      };
    });
    return {
      budgeted,
      spent,
      remaining: budgeted - spent,
      overdue: sumOf(overdueRows, (r) => Math.max(0, r.remaining)),
      overdueCount: overdueRows.length,
      pending: sumOf(pendingRows, (r) => Math.max(0, r.remaining)),
      pendingCount: pendingRows.length,
      quarters,
    };
  }, [rows]);

  const statusTabs = STATUS_TABS.map((t) => ({
    ...t,
    count: t.code === 'All' ? rows.length : rows.filter((r) => r.status === t.code).length,
  }));
  const quarterTabs = [
    { code: 'All', label: 'All quarters' },
    ...QUARTERS.map((q) => ({ code: q.key, label: q.label, hint: q.months })),
  ];

  const columns = [
    {
      key: 'line',
      header: 'Budget line',
      sortValue: (row) => `${row.budgetCode} ${row.lineCode} ${row.quarter}`,
      render: (row) => {
        const Icon = BUDGET_TYPE_ICON[row.budgetType] || BUDGET_TYPE_ICON.PROGRAMME;
        return (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 210 }}>
            <Tooltip title={BUDGET_TYPE[row.budgetType] || ''}>
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  flexShrink: 0,
                  borderRadius: 1.5,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: 'var(--card2)',
                  color: 'text.secondary',
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
              </Box>
            </Tooltip>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>{row.line || '—'}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {row.budgetCode} · {row.lineCode} ·{' '}
                <Tooltip title={BOOK[row.book] || ''}>
                  <Box component="span" sx={{ fontWeight: 700, color: row.book === 'FC' ? 'text.primary' : 'text.secondary' }}>{row.book}</Box>
                </Tooltip>
              </Typography>
            </Box>
          </Stack>
        );
      },
    },
    {
      key: 'scope',
      header: 'Scope',
      sortValue: (row) => row.scope,
      render: (row) => (
        <Box sx={{ minWidth: 150, maxWidth: 230 }} title={`${row.scope} · ${row.categoryName} · ${row.stateName || 'All states'}`}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.35 }}>{row.scope}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary', mt: 0.25, minWidth: 0 }}>
            <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>{row.categoryName}</Typography>
            <Typography variant="caption">·</Typography>
            <PlaceOutlinedIcon sx={{ fontSize: 13 }} />
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{row.stateName || 'All states'}</Typography>
          </Stack>
        </Box>
      ),
    },
    {
      key: 'expectedDate',
      header: 'Due',
      sortValue: (row) => row.expectedDate,
      render: (row) => {
        const late = row.status === 'OVERDUE' || row.status === 'PENDING' ? daysLate(row) : 0;
        return (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.35 }}>
              <Box component="span" sx={{ fontWeight: 700 }}>Q{row.quarter}</Box> · {formatDate(row.expectedDate)}
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: row.status === 'OVERDUE' ? 'error.main' : row.status === 'PENDING' ? 'warning.main' : 'text.secondary' }}
            >
              {late ? `${late} ${late === 1 ? 'day' : 'days'} late` : row.status === 'PAID' ? 'Done' : 'On track'}
            </Typography>
          </Box>
        );
      },
    },
    {
      key: 'expectedAmount',
      header: 'Budgeted',
      align: 'right',
      sortValue: (row) => row.expectedAmount,
      render: (row) => <Box sx={{ ...MONEY_SX, fontWeight: 600 }}>{formatInrExact(row.expectedAmount)}</Box>,
    },
    {
      key: 'spent',
      header: 'Spent',
      align: 'right',
      sortValue: (row) => row.spent,
      // Amount and a small bar for how much of the budgeted amount has gone out.
      render: (row) => {
        const share = pct(row.spent, row.expectedAmount);
        return (
          <Box sx={{ minWidth: 84, ml: 'auto' }}>
            <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: row.spent ? 600 : 400, color: row.spent ? 'text.primary' : 'text.disabled' }}>
              {row.spent ? formatInrExact(row.spent) : '—'}
            </Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
              <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${Math.min(100, share)}%`, bgcolor: share > 100 ? 'var(--err)' : 'text.secondary' }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ ...MONEY_SX, width: 32, textAlign: 'right' }}>{share}%</Typography>
            </Stack>
          </Box>
        );
      },
    },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      sortValue: (row) => row.remaining,
      render: (row) => {
        if (row.remaining < 0) {
          return (
            <Box sx={{ ...MONEY_SX, color: 'error.main', fontWeight: 600 }}>
              −{formatInrExact(-row.remaining)}
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 400 }}>over budget</Typography>
            </Box>
          );
        }
        return (
          <Box sx={{ ...MONEY_SX, color: row.remaining ? 'text.primary' : 'text.secondary', fontWeight: row.remaining ? 600 : 400 }}>
            {row.remaining ? formatInrExact(row.remaining) : '—'}
          </Box>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (row) => ['OVERDUE', 'PENDING', 'DUE', 'PAID'].indexOf(row.status),
      render: (row) => (
        <StatusChip label={PAYMENT_STATUS[row.status] || row.status} tone={PAYMENT_STATUS_TONE[row.status]} />
      ),
    },
  ];

  const footer =
    filteredRows.length > 0 ? (
      <TableFooter>
        <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
          <TableCell colSpan={3} sx={{ fontWeight: 600 }}>
            Total · {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
            {filtersActive ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (filtered from {rows.length})
              </Typography>
            ) : null}
          </TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(sumOf(filteredRows, (r) => r.expectedAmount))}</TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(sumOf(filteredRows, (r) => r.spent))}</TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(sumOf(filteredRows, (r) => r.remaining))}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    ) : null;

  const fyOptions = fyMaster.options.map((o) => o.label);
  const fyLabel = fy === 'All' ? 'all years' : `FY ${fy}`;

  // Export what's shown (year + filters): one row per budget line per quarter.
  const [exportAnchor, setExportAnchor] = useState(null);
  const exportRows = () => {
    setExportAnchor(null);
    const today = new Date();
    const fileTag = `${fy === 'All' ? 'all-years' : `fy-${fy}`}-${today.toLocaleDateString('en-CA')}`;
    downloadCsv(`outflow-${fileTag}.csv`, outflowRowsCsv(filteredRows, today.getTime()));
  };

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        eyebrow={fy === 'All' ? 'All financial years' : `FY ${fy}${fy === fyMaster.activeLabel ? ' · current year' : ''}`}
        title="Outflow budget"
        subtitle="Budgeted vs spent for every approved budget line, quarter by quarter. Rows appear when a budget is approved; spending is recorded as debit notes — open a row to see them."
      />

      <StatStrip
        sx={{ mb: 3 }}
        stats={[
          {
            label: `Budgeted · ${fyLabel}`,
            value: formatInr(kpis.budgeted),
            note: `${rows.length} quarter rows · approved budgets`,
          },
          {
            label: 'Spent',
            value: formatInr(kpis.spent),
            note: `${pct(kpis.spent, kpis.budgeted)}% of budget · as at ${formatDate(new Date())}`,
          },
          {
            label: 'Remaining',
            value: formatInr(kpis.remaining),
            note: 'still to go out this year',
            color: 'success.main',
          },
          {
            label: 'Overdue',
            value: formatInr(kpis.overdue),
            note: `${kpis.overdueCount} ${kpis.overdueCount === 1 ? 'row' : 'rows'}${kpis.pendingCount ? ` · ${kpis.pendingCount} pending (${formatInr(kpis.pending)})` : ''}`,
            color: kpis.overdueCount ? 'error.main' : undefined,
          },
        ]}
        footer={rows.length ? <QuarterFooter quarters={kpis.quarters} /> : null}
      />

      {/* Row 1: status and quarter tabs. Row 2: search and the year / type / book filters. */}
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
            <MenuItem onClick={exportRows}>
              <ListItemText primary="Outflow rows (CSV)" secondary="One row per budget line per quarter — budgeted, spent, remaining, status" />
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>
      <Stack
        direction="row"
        sx={{ mb: 1.5, gap: 1, alignItems: 'center', flexWrap: 'wrap', '& .MuiInputBase-root': { height: 36, fontSize: 13 } }}
      >
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 280px' }, maxWidth: { sm: 380 } }}>
          <SearchField placeholder="Search budget, line, programme or category…" value={searchQuery} onChange={setSearchQuery} />
        </Box>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select value={fy} onChange={(e) => setFyChoice(e.target.value)} inputProps={{ 'aria-label': 'Financial year' }}>
            {fyOptions.map((label) => (
              <MenuItem key={label} value={label}>
                FY {label}{label === fyMaster.activeLabel ? ' (current)' : ''}
              </MenuItem>
            ))}
            <MenuItem value="All">All FYs</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} inputProps={{ 'aria-label': 'Budget type' }}>
            <MenuItem value="All">All types</MenuItem>
            {Object.entries(BUDGET_TYPE).map(([code, label]) => (
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

      <DataTable
        dense
        columns={columns}
        rows={filteredRows}
        getRowKey={(row) => row.id}
        isLoading={rowsQuery.isPending}
        error={rowsQuery.isError ? rowsQuery.error : null}
        onRetry={rowsQuery.refetch}
        defaultSort={{ key: 'expectedDate', direction: 'asc' }}
        footer={footer}
        emptyTitle={rows.length ? 'No outflow rows match these filters' : 'No approved budgets yet'}
        emptyDescription={
          rows.length
            ? 'Try clearing the filters.'
            : 'Outflow rows appear here once a budget for this year is approved under Budget.'
        }
        onRowClick={(row) => navigate(`/outflow-budget/${row.id}`)}
      />
    </Box>
  );
}
