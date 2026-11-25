import { useMemo, useState } from 'react';
import {
  Box,
  Button,
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
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNavigate } from 'react-router-dom';
import { ACTIONS, PermissionGate } from '../../../core/permissions/index.js';
import { DataTable, PageHeader, SearchField, StatusChip } from '../../../shared/components/index.js';
import { formatDate } from '../../../lib/format/date.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { downloadCsv } from '../../../lib/export/csv.js';
import { downloadXlsx } from '../../../lib/export/xlsx.js';
import { FUND_CLASS_CODE_LABEL, FUND_CLASS_CODE_TONE } from '../../donor-management/constants.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { financialYearOf } from '../../budget/lib/financialYear.js';
import { useInflowBudgetLines } from '../../inflow-budget/hooks/useInflowBudget.js';
import { useFundingRecords } from '../hooks/useFunding.js';
import { StagePipeline } from '../components/StagePipeline.jsx';
import { STAGE_BY_KEY, codeSortValue, matchesSearch } from '../lib/fundingRecords.js';
import { fundingCsv, fundingWorkbook } from '../lib/fundingExport.js';
import { CLASS_NAME, MODULE_ID } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const DAY = 24 * 60 * 60 * 1000;
/** Agreements ending within this many days are flagged. */
const ENDING_SOON_DAYS = 60;

const CLASS_FILTER_OPTIONS = [
  { value: 'all', label: 'All classes' },
  { value: 'A', label: 'Class A · Restricted' },
  { value: 'B', label: 'Class B · Unrestricted w/ explanation' },
  { value: 'C', label: 'Class C · Fully unrestricted' },
  { value: 'none', label: 'Class not set' },
];

const committedOf = (r) => (r.hasSchedule ? Number(r.committed) || 0 : 0);
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Days from `asAt` to an ISO date (negative once it has passed). */
const daysUntil = (iso, asAt) => (iso ? Math.ceil((new Date(iso).getTime() - asAt.getTime()) / DAY) : null);

/** ₹ received per fund profile — the inflow lines' actuals (credit notes against its tranches). */
function useReceivedByProfile() {
  const linesQuery = useInflowBudgetLines();
  const byProfile = useMemo(() => {
    const map = new Map();
    for (const line of linesQuery.data || []) {
      if (line.fundProfileId == null || line.actualAmount == null) continue;
      map.set(line.fundProfileId, (map.get(line.fundProfileId) || 0) + (Number(line.actualAmount) || 0));
    }
    return map;
  }, [linesQuery.data]);
  return { byProfile, isPending: linesQuery.isPending, failed: linesQuery.isError };
}

/** Unified register of fund profiles and their grant agreements — /funding. */
export function FundingListPage() {
  const navigate = useNavigate();
  const { records, isPending, error, refetch } = useFundingRecords();
  const receipts = useReceivedByProfile();
  const asAt = useMemo(() => new Date(), []);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [donorFilter, setDonorFilter] = useState('all');
  const [fyFilter, setFyFilter] = useState('all');
  const [exportAnchor, setExportAnchor] = useState(null);

  // Every record with what has come in, its FY (from the agreement start) and days to its end.
  const all = useMemo(
    () =>
      records.map((r) => ({
        ...r,
        received: r.profileId != null ? receipts.byProfile.get(r.profileId) || 0 : 0,
        fy: r.startDate ? financialYearOf(new Date(r.startDate)) : null,
        daysLeft: r.endDate ? daysUntil(r.endDate, asAt) : null,
      })),
    [records, receipts.byProfile, asAt],
  );

  const donorOptions = useMemo(
    () =>
      [...new Map(all.map((r) => [String(r.donorId ?? r.donorName), r.donorName])).entries()].sort((a, b) =>
        a[1].localeCompare(b[1]),
      ),
    [all],
  );
  const fyOptions = useMemo(() => [...new Set(all.map((r) => r.fy).filter(Boolean))].sort().reverse(), [all]);

  const rows = useMemo(
    () =>
      all.filter((r) => {
        if (stageFilter !== 'all' && r.stage !== stageFilter) return false;
        if (classFilter !== 'all' && (r.classCode || 'none') !== classFilter) return false;
        if (donorFilter !== 'all' && String(r.donorId ?? r.donorName) !== donorFilter) return false;
        if (fyFilter !== 'all' && (fyFilter === 'none' ? r.fy : r.fy !== fyFilter)) return false;
        return matchesSearch(r, search);
      }),
    [all, search, stageFilter, classFilter, donorFilter, fyFilter],
  );

  const filtered =
    Boolean(search.trim()) || stageFilter !== 'all' || classFilter !== 'all' || donorFilter !== 'all' || fyFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStageFilter('all');
    setClassFilter('all');
    setDonorFilter('all');
    setFyFilter('all');
  };

  const endingSoon = all.filter((r) => r.daysLeft != null && r.daysLeft >= 0 && r.daysLeft <= ENDING_SOON_DAYS && r.stage !== 'completed');

  // Export exactly what is shown.
  const fileTag = asAt.toLocaleDateString('en-CA');
  const filterNote = filtered ? `filtered: ${rows.length} of ${all.length}` : '';
  const exportAs = (kind) => {
    setExportAnchor(null);
    if (kind === 'xlsx') downloadXlsx(`funding-agreements-${fileTag}.xlsx`, fundingWorkbook(rows, { asAt, filterNote }));
    else downloadCsv(`funding-agreements-${fileTag}.csv`, fundingCsv(rows));
  };

  const columns = [
    {
      key: 'code',
      header: 'Funding',
      sortValue: codeSortValue,
      render: (row) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
            {row.profileCode || row.grantCode}
          </Typography>
          {row.profileCode && row.grantCode ? (
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
              <LinkIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{row.grantCode}</Typography>
            </Stack>
          ) : row.profileCode ? (
            <Typography variant="caption" sx={{ color: 'var(--warn)' }}>No agreement yet</Typography>
          ) : (
            <Typography variant="caption" color="text.disabled">No fund profile linked</Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'title',
      header: 'Agreement · donor',
      sortValue: (row) => row.title || row.donorName,
      render: (row) => (
        <Box sx={{ minWidth: { xs: 160, lg: 190 }, maxWidth: 300 }}>
          <Typography
            variant="body2"
            title={row.title || ''}
            sx={{
              fontWeight: 600,
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              color: row.title ? 'text.primary' : 'text.disabled',
            }}
          >
            {row.title || 'No purpose recorded'}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap component="div" title={[row.donorName, row.programmeName].filter(Boolean).join(' · ')}>
            {row.donorName}
            {row.programmeName ? ` · ${row.programmeName}` : ''}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      sortValue: (row) => row.classCode,
      render: (row) =>
        row.classCode ? (
          <Tooltip title={FUND_CLASS_CODE_LABEL[row.classCode] || ''} describeChild>
            <span>
              {/* Full name on wide screens; just "Class A" when space is tight (meaning on hover). */}
              <StatusChip
                tone={FUND_CLASS_CODE_TONE[row.classCode]}
                label={
                  <>
                    <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>{`${row.classCode} · ${CLASS_NAME[row.classCode]}`}</Box>
                    <Box component="span" sx={{ display: { lg: 'none' } }}>{`Class ${row.classCode}`}</Box>
                  </>
                }
              />
            </span>
          </Tooltip>
        ) : (
          <StatusChip label="Not set" tone="neutral" />
        ),
    },
    {
      key: 'period',
      header: 'Period',
      sortValue: (row) => row.endDate,
      render: (row) => {
        if (!row.startDate) return <Typography variant="caption" color="text.disabled">Set on agreement</Typography>;
        const soon = row.daysLeft != null && row.daysLeft >= 0 && row.daysLeft <= ENDING_SOON_DAYS && row.stage !== 'completed';
        const ended = row.daysLeft != null && row.daysLeft < 0 && row.stage !== 'completed';
        return (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Typography variant="body2" sx={{ lineHeight: 1.35 }}>{formatDate(row.startDate)}</Typography>
            <Typography variant="caption" color="text.secondary">to {formatDate(row.endDate)}</Typography>
            {soon ? (
              <Typography variant="caption" sx={{ display: 'block', color: 'var(--warn)', fontWeight: 700 }}>
                Ends in {row.daysLeft} {row.daysLeft === 1 ? 'day' : 'days'}
              </Typography>
            ) : ended ? (
              <Typography variant="caption" sx={{ display: 'block', color: 'var(--err)', fontWeight: 700 }}>
                Ended {-row.daysLeft} {row.daysLeft === -1 ? 'day' : 'days'} ago
              </Typography>
            ) : null}
          </Box>
        );
      },
    },
    {
      key: 'committed',
      header: 'Committed · received',
      align: 'right',
      sortValue: (row) => (row.hasSchedule ? row.committed : null),
      render: (row) => {
        if (!row.hasSchedule) return <Typography variant="caption" color="text.disabled">No schedule yet</Typography>;
        const share = pct(row.received, committedOf(row));
        return (
          <Box sx={{ minWidth: 120, ml: 'auto' }}>
            <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 700 }}>
              {formatInrExact(row.committed)}
              {row.currency && row.foreignAmount != null ? (
                <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, fontSize: 11.5, ml: 0.75 }}>
                  {formatForeign(row.currency, row.foreignAmount)}
                </Box>
              ) : null}
            </Typography>
            {receipts.isPending ? (
              <Typography variant="caption" color="text.disabled">…</Typography>
            ) : (
              <Tooltip title={`${formatInrExact(row.received)} received of ${formatInrExact(committedOf(row))}`} describeChild>
                <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
                  <Typography variant="caption" sx={{ ...MONEY_SX, color: row.received ? 'success.main' : 'text.disabled', fontWeight: row.received ? 600 : 400 }}>
                    {row.received ? `${formatInrExact(row.received)} · ${share}%` : 'nothing received'}
                  </Typography>
                  <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'var(--line2)', overflow: 'hidden', flexShrink: 0 }}>
                    <Box sx={{ height: '100%', width: `${Math.min(100, share)}%`, bgcolor: 'var(--ok)' }} />
                  </Box>
                </Stack>
              </Tooltip>
            )}
          </Box>
        );
      },
    },
    {
      key: 'stage',
      header: 'Stage',
      sortValue: (row) => row.stage,
      render: (row) => (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <StatusChip label={STAGE_BY_KEY[row.stage].label} tone={STAGE_BY_KEY[row.stage].tone} />
          {row.href ? <ChevronRightRoundedIcon sx={{ color: 'text.disabled', fontSize: 20 }} /> : null}
        </Stack>
      ),
    },
  ];

  const totalCommitted = rows.reduce((s, r) => s + committedOf(r), 0);
  const totalReceived = rows.reduce((s, r) => s + r.received, 0);
  const footer =
    rows.length > 1 ? (
      <TableFooter>
        <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
          <TableCell colSpan={4} sx={{ fontWeight: 600 }}>
            Total · {rows.length} funding records
            {filtered ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (filtered from {all.length})
              </Typography>
            ) : null}
          </TableCell>
          <TableCell align="right" sx={MONEY_SX}>
            <Box sx={{ fontWeight: 700 }}>{formatInrExact(totalCommitted)}</Box>
            <Box sx={{ fontSize: 12, color: 'success.main', fontWeight: 600 }}>
              {receipts.isPending ? '…' : `${formatInrExact(totalReceived)} received · ${pct(totalReceived, totalCommitted)}%`}
            </Box>
          </TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Donor & grants"
        title="Funding Agreements"
        subtitle="Each donor's terms and the grant agreement signed on them, tracked as one record from first draft to completion."
        actions={
          <PermissionGate action={ACTIONS.EDIT} moduleId={MODULE_ID}>
            <Button id="tour-new-funding" variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/funding/new')}>
              New funding
            </Button>
          </PermissionGate>
        }
      />

      {records.length ? <StagePipeline records={records} activeStage={stageFilter} onStageClick={setStageFilter} /> : null}

      {endingSoon.length ? (
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
          sx={{ mb: 2, px: 2, py: 1.1, borderRadius: 2, border: '1px solid var(--line)', bgcolor: 'var(--warn-bg)', flexWrap: 'wrap', rowGap: 0.5 }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'var(--warn)' }}>
            {endingSoon.length} {endingSoon.length === 1 ? 'agreement ends' : 'agreements end'} within {ENDING_SOON_DAYS} days
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {endingSoon
              .slice(0, 3)
              .map((r) => `${r.profileCode} (${formatDate(r.endDate)})`)
              .join(' · ')}
            {endingSoon.length > 3 ? ' …' : ''} — plan the final report or a renewal.
          </Typography>
        </Stack>
      ) : null}

      <Stack direction="row" sx={{ mb: 1.5, gap: 1, alignItems: 'center', flexWrap: 'wrap', '& .MuiInputBase-root': { height: 36, fontSize: 13 } }}>
        <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 240px' }, maxWidth: { sm: 320 } }}>
          <SearchField value={search} onChange={setSearch} placeholder="Search code, donor or agreement…" />
        </Box>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <Select value={donorFilter} onChange={(e) => setDonorFilter(e.target.value)} inputProps={{ 'aria-label': 'Donor' }}>
            <MenuItem value="all">All donors</MenuItem>
            {donorOptions.map(([value, label]) => (
              <MenuItem key={value} value={value}>{label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <Select value={fyFilter} onChange={(e) => setFyFilter(e.target.value)} inputProps={{ 'aria-label': 'Financial year' }}>
            <MenuItem value="all">All years</MenuItem>
            {fyOptions.map((fy) => (
              <MenuItem key={fy} value={fy}>FY {fy}</MenuItem>
            ))}
            <MenuItem value="none">No agreement dates</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} inputProps={{ 'aria-label': 'Restriction class' }}>
            {CLASS_FILTER_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        {filtered ? (
          <Typography
            component="button"
            type="button"
            onClick={clearFilters}
            sx={{ font: 'inherit', fontSize: 13, border: 0, bgcolor: 'transparent', color: 'text.secondary', cursor: 'pointer', px: 1, '&:hover': { color: 'text.primary' } }}
          >
            Clear filters
          </Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          Showing {rows.length} of {all.length}
        </Typography>
        <Button
          variant="outlined"
          startIcon={<FileDownloadOutlinedIcon />}
          onClick={(e) => setExportAnchor(e.currentTarget)}
          disabled={!rows.length}
          aria-haspopup="menu"
          sx={{ height: 36, whiteSpace: 'nowrap' }}
        >
          Export {rows.length}
        </Button>
        <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
          <MenuItem onClick={() => exportAs('xlsx')}>
            <ListItemIcon><GridOnOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Excel workbook (.xlsx)" secondary="Summary by stage, class and donor · agreements with formulas" />
          </MenuItem>
          <MenuItem onClick={() => exportAs('csv')}>
            <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Agreements (CSV)" secondary="One row per funding record — committed, received, stage" />
          </MenuItem>
        </Menu>
      </Stack>

      <DataTable
        dense
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.key}
        defaultSort={{ key: 'code', direction: 'desc' }}
        isLoading={isPending && !records.length}
        error={error}
        onRetry={refetch}
        footer={footer}
        emptyTitle={filtered ? 'Nothing matches these filters' : 'No funding recorded yet'}
        emptyDescription={
          filtered
            ? 'Try a different search, stage, donor, year or class — or clear the filters.'
            : 'Use “New funding” to record a donor’s terms and the agreement signed on them in one form.'
        }
        onRowClick={(row) => row.href && navigate(row.href)}
      />
    </>
  );
}
