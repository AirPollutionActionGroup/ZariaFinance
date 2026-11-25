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
import AddIcon from '@mui/icons-material/Add';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { downloadCsv } from '../../../lib/export/csv.js';
import { budgetService } from '../services/budgetService.js';
import { budgetLinesCsv, budgetsCsv } from '../lib/budgetExport.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DataTable, PageHeader, SearchField, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { useBudgetFinancialYears, useBudgets } from '../hooks/useBudgets.js';
import { isFinancialYearLabel } from '../lib/financialYear.js';
import { BUDGET_TYPE_ICON } from '../components/budgetTypeIcons.js';
import {
  BUDGET_STATUS,
  BUDGET_STATUS_TONE,
  BUDGET_TYPE,
  CURRENT_FINANCIAL_YEAR,
  budgetTypeOf,
} from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };
/** Workflow order, so sorting by Status reads Draft → Submitted → Approved → Rejected. */
const STATUS_ORDER = { DRAFT: 0, SUBMITTED: 1, APPROVED: 2, REJECTED: 3 };
const sum = (list) => list.reduce((s, b) => s + b.total, 0);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
/** Short type name for the scope line: "Organisation", "Programme", "Project". */
const typeShort = (b) => BUDGET_TYPE[budgetTypeOf(b)].replace('-based', '');

/** The approval pipeline as one bar: how much of the year is approved, waiting, in draft or returned. */
const PIPELINE = [
  { key: 'approved', label: 'Approved', color: 'var(--ok)' },
  { key: 'pending', label: 'Awaiting approval', color: 'var(--info)' },
  { key: 'draftOnly', label: 'In draft', color: 'var(--muted)' },
  { key: 'rejected', label: 'Returned', color: 'var(--err)' },
];

function Legend({ color, label, value }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />
      <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
        {label} <Box component="span" sx={{ ...MONEY_SX, color: 'text.primary', fontWeight: 600 }}>{value}</Box>
      </Typography>
    </Stack>
  );
}

/** Footer of the KPI strip: the status pipeline bar and the split by budget type. */
function OverviewFooter({ kpis }) {
  const typeRows = Object.keys(BUDGET_TYPE).map((code) => ({ code, amount: kpis.byType[code] || 0 }));
  return (
    <Box
      sx={{
        borderTop: '1px solid',
        borderColor: 'divider',
        px: 2.5,
        py: 1.75,
        display: 'grid',
        gap: { xs: 2, md: 4 },
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>Approval pipeline</Typography>
        <Box sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: 'var(--line2)', gap: '2px' }}>
          {kpis.planned > 0
            ? PIPELINE.filter((p) => kpis[p.key] > 0).map((p) => (
                <Tooltip key={p.key} title={`${p.label} · ${formatInrExact(kpis[p.key])} · ${pct(kpis[p.key], kpis.planned)}%`}>
                  <Box sx={{ width: `${(kpis[p.key] / kpis.planned) * 100}%`, bgcolor: p.color }} />
                </Tooltip>
              ))
            : null}
        </Box>
        <Stack direction="row" sx={{ mt: 0.75, columnGap: 2, rowGap: 0.25, flexWrap: 'wrap' }}>
          {PIPELINE.map((p) => (
            <Legend key={p.key} color={p.color} label={p.label} value={`${pct(kpis[p.key], kpis.planned)}%`} />
          ))}
        </Stack>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>By type</Typography>
        <Stack spacing={0.6}>
          {typeRows.map(({ code, amount }) => {
            const Icon = BUDGET_TYPE_ICON[code];
            return (
              <Stack key={code} direction="row" spacing={1} alignItems="center">
                <Icon sx={{ fontSize: 15, color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ width: 84, flexShrink: 0 }}>{BUDGET_TYPE[code].replace('-based', '')}</Typography>
                <Box sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
                  <Box sx={{ height: '100%', width: `${pct(amount, kpis.planned)}%`, bgcolor: 'text.primary', borderRadius: 3 }} />
                </Box>
                <Typography variant="caption" sx={{ ...MONEY_SX, fontWeight: 600, width: 70, textAlign: 'right', flexShrink: 0 }}>
                  {formatInr(amount)}
                </Typography>
              </Stack>
            );
          })}
        </Stack>
      </Box>
    </Box>
  );
}

/** All budgets — /budgets. */
export function BudgetListPage() {
  const navigate = useNavigate();
  const budgetsQuery = useBudgets();
  const budgets = useMemo(() => budgetsQuery.data || [], [budgetsQuery.data]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');

  // The FY lives in the URL (?fy=2026-27 | ?fy=All) so Back from a budget returns to the same year.
  const [searchParams, setSearchParams] = useSearchParams();
  const fyParam = searchParams.get('fy');
  // Years from the Financial Year master; the default is the year running today (master status ACTIVE).
  const fyMaster = useBudgetFinancialYears();
  const defaultFy = fyMaster.activeLabel || CURRENT_FINANCIAL_YEAR;
  const fy = fyParam === 'All' || isFinancialYearLabel(fyParam) ? fyParam : defaultFy;
  const setFy = (value) => setSearchParams({ fy: value }, { replace: true });
  // Every master year (closed ones too, to look back), plus any year a budget uses.
  const fyOptions = [...new Set([...fyMaster.options.map((o) => o.label), ...budgets.map((b) => b.financialYear)])].sort();

  const fyBudgets = useMemo(() => budgets.filter((b) => fy === 'All' || b.financialYear === fy), [budgets, fy]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return fyBudgets.filter((b) => {
      const matchesSearch =
        !q || [b.budgetCode, b.name, b.programme, b.stateName].some((text) => (text || '').toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
      const matchesType = typeFilter === 'All' || budgetTypeOf(b) === typeFilter;
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [fyBudgets, searchQuery, statusFilter, typeFilter]);

  const filtersActive = Boolean(searchQuery.trim()) || statusFilter !== 'All' || typeFilter !== 'All';
  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('All');
    setTypeFilter('All');
  };

  // KPIs describe the whole financial year, independent of the search / type / status filters.
  const kpis = useMemo(() => {
    const where = (pred) => fyBudgets.filter(pred);
    const approved = where((b) => b.status === 'APPROVED');
    const pending = where((b) => b.status === 'SUBMITTED');
    const draftOnly = where((b) => b.status === 'DRAFT');
    const rejected = where((b) => b.status === 'REJECTED');
    const byType = {};
    for (const b of fyBudgets) byType[budgetTypeOf(b)] = (byType[budgetTypeOf(b)] || 0) + b.total;
    return {
      planned: sum(fyBudgets),
      count: fyBudgets.length,
      approved: sum(approved),
      approvedCount: approved.length,
      pending: sum(pending),
      pendingCount: pending.length,
      draftOnly: sum(draftOnly),
      rejected: sum(rejected),
      drafts: sum(draftOnly) + sum(rejected),
      draftCount: draftOnly.length + rejected.length,
      rejectedCount: rejected.length,
      byType,
    };
  }, [fyBudgets]);
  const fyTotal = kpis.planned;

  const columns = [
    {
      key: 'id',
      header: 'Budget',
      sortValue: (b) => b.name,
      render: (b) => {
        const Icon = BUDGET_TYPE_ICON[budgetTypeOf(b)];
        return (
          <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 220 }}>
            <Tooltip title={BUDGET_TYPE[budgetTypeOf(b)]}>
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
              <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>{b.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                {b.budgetCode}{fy === 'All' ? ` · FY ${b.financialYear}` : ''}
              </Typography>
            </Box>
          </Stack>
        );
      },
    },
    {
      key: 'scope',
      header: 'Scope',
      sortValue: (b) => `${budgetTypeOf(b)} ${b.programme}`,
      // Programme / project on top; type and state underneath, in one quiet line.
      render: (b) => (
        <Box sx={{ minWidth: 170 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35 }}>{b.programme}</Typography>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary', mt: 0.25 }}>
            <Typography variant="caption">{typeShort(b)}</Typography>
            <Typography variant="caption">·</Typography>
            <PlaceOutlinedIcon sx={{ fontSize: 13 }} />
            <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>{b.stateName || 'All states'}</Typography>
          </Stack>
        </Box>
      ),
    },
    {
      key: 'total',
      header: 'Total budget',
      align: 'right',
      sortValue: (b) => b.total,
      // Amount, lines, and a small bar for its share of the year's total.
      render: (b) => {
        const share = pct(b.total, fyTotal);
        return (
          <Box sx={{ minWidth: 130, ml: 'auto' }}>
            <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(b.total)}</Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
              <Box sx={{ width: 48, height: 4, borderRadius: 2, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${share}%`, bgcolor: 'text.secondary' }} />
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ ...MONEY_SX, whiteSpace: 'nowrap' }}>
                {share}% · {b.lineCount} {b.lineCount === 1 ? 'line' : 'lines'}
              </Typography>
            </Stack>
          </Box>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (b) => STATUS_ORDER[b.status],
      render: (b) => <StatusChip label={BUDGET_STATUS[b.status]} tone={BUDGET_STATUS_TONE[b.status]} />,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortValue: (b) => b.updatedAt,
      render: (b) => (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.35 }}>{formatDate(b.updatedAt)}</Typography>
            <Typography variant="caption" color="text.secondary">by {b.owner || '—'}</Typography>
          </Box>
          <ChevronRightRoundedIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
        </Stack>
      ),
    },
  ];

  const footer =
    filtered.length > 0 ? (
      <TableFooter>
        <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
          <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
            Total · {filtered.length} {filtered.length === 1 ? 'budget' : 'budgets'}
            {filtersActive ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (filtered from {fyBudgets.length})
              </Typography>
            ) : null}
          </TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>
            {formatInrExact(sum(filtered))}
          </TableCell>
          <TableCell colSpan={2} />
        </TableRow>
      </TableFooter>
    ) : null;

  const fyLabel = fy === 'All' ? 'all years' : `FY ${fy}`;

  // Export the budgets shown (FY + search + status + type): one row each, or every line with its quarters.
  const [exportAnchor, setExportAnchor] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const fileTag = `${fy === 'All' ? 'all-years' : `fy-${fy}`}-${new Date().toLocaleDateString('en-CA')}`;
  const exportBudgets = () => {
    setExportAnchor(null);
    downloadCsv(`budgets-${fileTag}.csv`, budgetsCsv(filtered));
  };
  const exportLines = async () => {
    setExportAnchor(null);
    setExporting(true);
    setExportError(null);
    try {
      // The list has totals only; lines come from each budget, a few at a time.
      const full = [];
      for (let i = 0; i < filtered.length; i += 4) {
        full.push(...(await Promise.all(filtered.slice(i, i + 4).map((b) => budgetService.getBudget(b.id)))));
      }
      downloadCsv(`budget-lines-${fileTag}.csv`, budgetLinesCsv(full));
    } catch (err) {
      setExportError(err.message || 'Could not load the budget lines');
    } finally {
      setExporting(false);
    }
  };

  const statusTabs = [['All', 'All'], ...Object.entries(BUDGET_STATUS)];

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        eyebrow={fy === 'All' ? 'All financial years' : `FY ${fy}${fy === fyMaster.activeLabel ? ' · current year' : ''}`}
        title="Budgets"
        subtitle="Plan organisation, programme and project budgets for each financial year, phase them by quarter, and send them for approval."
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate(`/budgets/new?fy=${fy === 'All' ? defaultFy : fy}`)}
          >
            New budget
          </Button>
        }
      />

      <StatStrip
        sx={{ mb: 3 }}
        stats={[
          {
            label: `Total planned · ${fyLabel}`,
            value: formatInr(kpis.planned),
            note: `${kpis.count} ${kpis.count === 1 ? 'budget' : 'budgets'}`,
          },
          {
            label: 'Approved',
            value: formatInr(kpis.approved),
            note: `${kpis.approvedCount} ${kpis.approvedCount === 1 ? 'budget' : 'budgets'} · ${pct(kpis.approved, kpis.planned)}% of planned`,
            color: 'success.main',
          },
          {
            label: 'Awaiting approval',
            value: formatInr(kpis.pending),
            note: `${kpis.pendingCount} submitted`,
            color: kpis.pendingCount ? 'info.main' : undefined,
          },
          {
            label: 'In draft',
            value: formatInr(kpis.drafts),
            note: `${kpis.draftCount} ${kpis.draftCount === 1 ? 'budget' : 'budgets'}${kpis.rejectedCount ? ` · ${kpis.rejectedCount} returned` : ''}`,
          },
        ]}
        footer={kpis.count ? <OverviewFooter kpis={kpis} /> : null}
      />

      {/* Row 1: status tabs + export. Row 2: search and the year / type filters. */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        alignItems={{ md: 'center' }}
        justifyContent="space-between"
        spacing={1.5}
        sx={{ mb: 1.5 }}
      >
        <Box
          role="tablist"
          aria-label="Filter by status"
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
          {statusTabs.map(([code, label]) => {
            const selected = statusFilter === code;
            const n = code === 'All' ? fyBudgets.length : fyBudgets.filter((b) => b.status === code).length;
            return (
              <Box
                key={code}
                component="button"
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setStatusFilter(code)}
                sx={{
                  font: 'inherit',
                  border: 0,
                  cursor: 'pointer',
                  px: 1.5,
                  py: 0.6,
                  borderRadius: 1.5,
                  fontSize: 13,
                  fontWeight: selected ? 700 : 500,
                  whiteSpace: 'nowrap',
                  color: selected ? 'text.primary' : 'text.secondary',
                  bgcolor: selected ? 'background.paper' : 'transparent',
                  boxShadow: selected ? 'var(--shadow)' : 'none',
                  transition: 'background-color .15s ease, color .15s ease',
                  '&:hover': { color: 'text.primary' },
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                }}
              >
                {label}
                <Box
                  component="span"
                  sx={{
                    ml: 0.75,
                    px: 0.75,
                    borderRadius: 1,
                    fontSize: 11.5,
                    ...MONEY_SX,
                    bgcolor: selected ? 'var(--card2)' : 'transparent',
                    color: 'text.secondary',
                  }}
                >
                  {n}
                </Box>
              </Box>
            );
          })}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ alignSelf: { xs: 'flex-end', md: 'auto' } }}>
          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={(e) => setExportAnchor(e.currentTarget)}
            disabled={!filtered.length || exporting}
            aria-haspopup="menu"
            sx={{ whiteSpace: 'nowrap', height: 36 }}
          >
            {exporting ? 'Exporting…' : `Export ${filtered.length}`}
          </Button>
          <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={exportBudgets}>
              <ListItemText primary="Budgets" secondary="One row per budget — scope, status, total" />
            </MenuItem>
            <MenuItem onClick={exportLines}>
              <ListItemText primary="Budget lines" secondary="One row per line — category, book, Q1–Q4" />
            </MenuItem>
          </Menu>
        </Stack>
      </Stack>

      <Stack
        direction="row"
        sx={{
          mb: 1.5,
          gap: 1,
          alignItems: 'center',
          flexWrap: 'wrap',
          '& .MuiInputBase-root': { height: 36, fontSize: 13 },
        }}
      >
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 280px' }, maxWidth: { sm: 380 } }}>
          <SearchField placeholder="Search budget, programme or state…" value={searchQuery} onChange={setSearchQuery} />
        </Box>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select value={fy} onChange={(e) => setFy(e.target.value)} inputProps={{ 'aria-label': 'Financial year' }}>
            {fyOptions.map((option) => (
              <MenuItem key={option} value={option}>
                FY {option}{option === fyMaster.activeLabel ? ' (current)' : ''}
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
        {filtersActive ? (
          <Button size="small" onClick={clearFilters} sx={{ textTransform: 'none', color: 'text.secondary' }}>
            Clear filters
          </Button>
        ) : null}
      </Stack>
      {exportError ? (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          Export failed: {exportError}
        </Typography>
      ) : null}

      <DataTable
        dense
        columns={columns}
        rows={filtered}
        getRowKey={(b) => b.id}
        isLoading={budgetsQuery.isPending}
        error={budgetsQuery.isError ? budgetsQuery.error : null}
        onRetry={budgetsQuery.refetch}
        defaultSort={{ key: 'updatedAt', direction: 'desc' }}
        footer={footer}
        emptyTitle={filtersActive ? 'No budgets match these filters' : `No budgets in ${fyLabel} yet`}
        emptyDescription={filtersActive ? 'Try clearing the filters.' : 'Use “New budget” to plan the first one.'}
        onRowClick={(b) => navigate(`/budgets/${b.id}`)}
      />
    </Box>
  );
}
