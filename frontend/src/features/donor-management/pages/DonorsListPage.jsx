import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
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
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { downloadCsv } from '../../../lib/export/csv.js';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { useDocumentTypeName } from '../../masters/hooks/useDocumentTypes.js';
import { donorsCsv } from '../lib/donorExport.js';
import { useNavigate } from 'react-router-dom';
import { ACTIONS, PermissionGate } from '../../../core/permissions/index.js';
import { DataTable, PageHeader, SearchField, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { useDonors } from '../hooks/useDonors.js';
import { useFundingRecords } from '../../funding-agreements/hooks/useFunding.js';
import { DONOR_ACTIVE_TONE, FUND_SOURCE_DOMICILE_TONE, MODULE_ID } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** Status tabs; `match` picks the donors each one shows. */
const STATUS_TABS = [
  { value: 'all', label: 'All', match: () => true },
  { value: 'active', label: 'Active', match: (d) => d.isActive, color: 'var(--ok)' },
  { value: 'inactive', label: 'Inactive', match: (d) => !d.isActive, color: 'var(--muted)' },
];

/** Funding per donor from the funding register: agreements, approved count and committed ₹. */
function useFundingByDonor() {
  const { records, isPending, error } = useFundingRecords();
  const byDonor = useMemo(() => {
    const map = new Map();
    for (const r of records) {
      if (r.donorId == null || !r.href) continue;
      const entry = map.get(r.donorId) || { agreements: 0, approved: 0, committed: 0 };
      entry.agreements += 1;
      if (r.stage === 'approved') entry.approved += 1;
      if (r.hasSchedule) entry.committed += Number(r.committed) || 0;
      map.set(r.donorId, entry);
    }
    return map;
  }, [records]);
  return { byDonor, isPending, failed: Boolean(error) };
}

/** Segmented tabs with a count per tab — the same style as the budget lists. */
function StatusTabs({ value, onChange, counts }) {
  return (
    <Box
      role="tablist"
      aria-label="Filter by status"
      sx={{ display: 'inline-flex', p: 0.5, gap: 0.25, borderRadius: 2, bgcolor: 'var(--card2)', border: '1px solid', borderColor: 'divider' }}
    >
      {STATUS_TABS.map((t) => {
        const selected = value === t.value;
        return (
          <Box
            key={t.value}
            component="button"
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.value)}
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
            {t.color ? <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: t.color }} /> : null}
            {t.label}
            <Box component="span" sx={{ fontSize: 11.5, color: 'text.secondary', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              {counts[t.value]}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Donor register — /donors. */
export function DonorsListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const donorsQuery = useDonors(search);
  const navigate = useNavigate();
  const funding = useFundingByDonor();

  // While a new search loads, keep showing the last result so the page doesn't
  // jump (the summary strip would vanish and the search box would move).
  const [lastDonors, setLastDonors] = useState(null);
  if (donorsQuery.data && donorsQuery.data !== lastDonors) setLastDonors(donorsQuery.data);
  const shown = donorsQuery.data || lastDonors;
  const donors = useMemo(() => shown || [], [shown]);

  // Donor types present in the register, for the type filter.
  const donorTypes = useMemo(
    () => [...new Set(donors.map((d) => d.donorTypeLabel).filter((t) => t && t !== '—'))].sort(),
    [donors],
  );

  // Source + type narrow the register; the status tabs then count within that.
  const scoped = useMemo(
    () =>
      donors.filter(
        (d) =>
          (sourceFilter === 'all' || d.fundSourceDomicile === sourceFilter) &&
          (typeFilter === 'all' || d.donorTypeLabel === typeFilter),
      ),
    [donors, sourceFilter, typeFilter],
  );
  const rows = useMemo(() => {
    const tab = STATUS_TABS.find((t) => t.value === statusFilter) || STATUS_TABS[0];
    return scoped
      .filter(tab.match)
      .map((d) => ({ ...d, funding: funding.byDonor.get(d.id) || { agreements: 0, approved: 0, committed: 0 } }));
  }, [scoped, statusFilter, funding.byDonor]);
  const tabCounts = Object.fromEntries(STATUS_TABS.map((t) => [t.value, scoped.filter(t.match).length]));

  const filtersActive = Boolean(search.trim()) || statusFilter !== 'all' || sourceFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setSourceFilter('all');
    setTypeFilter('all');
  };

  // KPIs describe the whole register (search aside), not the tab/filters.
  const foreign = donors.filter((d) => d.fundSourceDomicile === 'FOREIGN');
  const fcra = donors.filter((d) => d.fcraApplicable).length;
  const active = donors.filter((d) => d.isActive).length;
  const totalCommitted = donors.reduce((s, d) => s + (funding.byDonor.get(d.id)?.committed || 0), 0);
  const funded = donors.filter((d) => funding.byDonor.get(d.id)?.agreements).length;
  const stats = [
    { label: 'Donors', value: donors.length, note: `${active} active · ${donors.length - active} inactive` },
    {
      label: 'Total committed',
      value: funding.failed ? '—' : formatInr(totalCommitted),
      note: funding.failed ? 'funding could not be loaded' : `${funded} of ${donors.length} donors have funding`,
      color: 'success.main',
    },
    { label: 'Domestic', value: donors.length - foreign.length, note: 'LC · local contribution' },
    { label: 'Foreign', value: foreign.length, note: `FC · ${fcra} FCRA applicable` },
  ];

  // Export what the list shows (search + filters), in the import template's layout.
  const documentTypeName = useDocumentTypeName();
  const handleExport = () => {
    const today = new Date().toLocaleDateString('en-CA');
    downloadCsv(`donors-${today}.csv`, donorsCsv(rows, documentTypeName));
  };

  const fundingCell = (render) => (row) =>
    funding.isPending ? <Typography variant="caption" color="text.disabled">…</Typography> : render(row);

  const columns = [
    {
      key: 'donorName',
      header: 'Donor',
      sortValue: (row) => row.donorName,
      render: (row) => (
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ minWidth: 220 }}>
          <Box
            aria-hidden
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: 1.5,
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'var(--card2)',
              color: 'text.secondary',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {(row.donorName || '?').trim().charAt(0).toUpperCase()}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.35 }}>{row.donorName}</Typography>
            <Typography variant="caption" color="text.secondary" component="div" noWrap sx={{ maxWidth: { xs: 220, lg: 340 } }}>
              <Box component="span" sx={{ fontFamily: 'monospace' }}>{row.donorCode}</Box>
              {row.email ? ` · ${row.email}` : ''}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'fundSourceDomicile',
      header: 'Source · type',
      sortValue: (row) => `${row.fundSourceDomicileLabel} ${row.donorTypeLabel}`,
      // Domestic / Foreign (+ FCRA) on top, the donor type underneath.
      render: (row) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <StatusChip label={row.fundSourceDomicileLabel} tone={FUND_SOURCE_DOMICILE_TONE[row.fundSourceDomicile] || 'neutral'} />
            {row.fcraApplicable ? (
              <Tooltip title="FCRA applicable" describeChild>
                <Typography variant="caption" sx={{ color: 'var(--warn)', fontWeight: 700 }}>FCRA</Typography>
              </Tooltip>
            ) : null}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>{row.donorTypeLabel}</Typography>
        </Box>
      ),
    },
    {
      key: 'agreements',
      header: 'Agreements',
      align: 'right',
      sortValue: (row) => row.funding.agreements,
      render: fundingCell((row) =>
        row.funding.agreements ? (
          <Box>
            <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 600 }}>{row.funding.agreements}</Typography>
            <Typography variant="caption" color="text.secondary" sx={MONEY_SX}>{row.funding.approved} approved</Typography>
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled">None yet</Typography>
        ),
      ),
    },
    {
      key: 'committed',
      header: 'Committed',
      align: 'right',
      sortValue: (row) => row.funding.committed,
      render: fundingCell((row) =>
        row.funding.committed ? (
          <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(row.funding.committed)}</Typography>
        ) : (
          <Typography variant="caption" color="text.disabled">—</Typography>
        ),
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      sortValue: (row) => (row.isActive ? 0 : 1),
      render: (row) => (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <StatusChip label={row.isActive ? 'Active' : 'Inactive'} tone={DONOR_ACTIVE_TONE[row.isActive] || 'neutral'} />
          <ChevronRightRoundedIcon sx={{ color: 'text.disabled', fontSize: 20 }} />
        </Stack>
      ),
    },
  ];

  const rowsCommitted = rows.reduce((s, r) => s + r.funding.committed, 0);
  const rowsAgreements = rows.reduce((s, r) => s + r.funding.agreements, 0);
  const footer =
    rows.length > 1 && !funding.isPending ? (
      <TableFooter>
        <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
          <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
            Total · {rows.length} donors
            {filtersActive ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (filtered from {donors.length})
              </Typography>
            ) : null}
          </TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{rowsAgreements}</TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(rowsCommitted)}</TableCell>
          <TableCell />
        </TableRow>
      </TableFooter>
    ) : null;

  return (
    <>
      <PageHeader
        eyebrow="Donor & grants"
        title="Donors"
        subtitle="Everyone who funds the organisation — their details, and the funding agreed with each."
        actions={
          <PermissionGate action={ACTIONS.EDIT} moduleId={MODULE_ID}>
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => navigate('/donors/import')}>
                Import
              </Button>
              <Button id="tour-new-donor" variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/donors/new')}>
                New donor
              </Button>
            </Stack>
          </PermissionGate>
        }
      />
      {donors.length ? <StatStrip stats={stats} sx={{ mb: 3 }} /> : null}

      {/* Kept outside the DataTable: the table swaps to a loading state while a
          new search runs, which would otherwise unmount the search box. */}
      <Box id="tour-donors-filters">
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between" sx={{ mb: 1.5 }}>
          <StatusTabs value={statusFilter} onChange={setStatusFilter} counts={tabCounts} />
          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={handleExport}
            disabled={!rows.length}
            title={`Download the ${rows.length} donor${rows.length === 1 ? '' : 's'} shown as a CSV file`}
            sx={{ height: 36, alignSelf: { xs: 'flex-end', md: 'auto' } }}
          >
            Export {rows.length}
          </Button>
        </Stack>
        <Stack direction="row" sx={{ mb: 1.5, gap: 1, alignItems: 'center', flexWrap: 'wrap', '& .MuiInputBase-root': { height: 36, fontSize: 13 } }}>
          <Box sx={{ flex: { xs: '1 1 100%', sm: '1 1 280px' }, maxWidth: { sm: 380 } }}>
            <SearchField value={search} onChange={setSearch} placeholder="Search name, code or email…" />
          </Box>
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} inputProps={{ 'aria-label': 'Fund source' }}>
              <MenuItem value="all">All fund sources</MenuItem>
              <MenuItem value="DOMESTIC">Domestic (LC)</MenuItem>
              <MenuItem value="FOREIGN">Foreign (FC)</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 170 }}>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} inputProps={{ 'aria-label': 'Donor type' }}>
              <MenuItem value="all">All donor types</MenuItem>
              {donorTypes.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
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
      </Box>

      <DataTable
        dense
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        isLoading={donorsQuery.isPending && !shown}
        error={donorsQuery.isError ? donorsQuery.error : null}
        onRetry={donorsQuery.refetch}
        footer={footer}
        emptyTitle={donors.length ? 'No donors match these filters' : 'No donors registered'}
        emptyDescription={donors.length ? 'Try clearing the filters.' : 'Create the first donor record to start mapping funding sources.'}
        onRowClick={(row) => navigate(`/donors/${row.id}`)}
      />
    </>
  );
}
