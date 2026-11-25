import { useMemo, useState } from 'react';
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Grid,
  MenuItem,
  Stack,
  TableCell,
  TableFooter,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import { useNavigate } from 'react-router-dom';
import { DataTable, PageHeader, SearchField, StatusChip } from '../../../shared/components/index.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { downloadCsv, toCsv } from '../../../lib/export/csv.js';
import { useFinancialYears } from '../../financial-year/hooks/useFinancialYears.js';
import { BOOK_TONE } from '../../../shared/constants/book.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { useCreditNotes } from '../hooks/useCreditNotes.js';
import { BookSplitBar, FigureStrip, FigureTile, MONEY_SX, pct, plural } from '../components/NoteLayout.jsx';
import { summarizeCreditNotes } from '../lib/summarizeCreditNotes.js';
import { donorsOf, EMPTY_FILTERS, filterCreditNotes, hasActiveFilters } from '../lib/filterCreditNotes.js';

/** "FP-2026-024-T1 — USD 700 (₹65,635.5)" → "FP-2026-024-T1" (the tranche snapshot stores its full label). */
const trancheCodeOf = (name) => String(name || '').split(' — ')[0];

/**
 * The figures for the notes listed below (they follow the filters): what came
 * in, how much went back to donor funds, the tranche / lump-sum split, and the
 * LC / FC split.
 */
function CreditFigures({ summary, period, filtered, onClearFilters }) {
  const lc = summary.byBook.LC.amount;
  const fc = summary.byBook.FC.amount;
  const { Tranches: tranches, 'Lump Sum': lump, None: none } = summary.byDisbursement;
  return (
    <FigureStrip period={period} count={summary.issuedCount} filtered={filtered} onClearFilters={onClearFilters}>
      <FigureTile
        label="Total credited"
        value={formatInrExact(summary.issuedTotal)}
        color={summary.issuedTotal ? 'success.main' : 'text.disabled'}
        sub={plural(summary.issuedCount, 'note')}
      />
      <FigureTile
        label="Returned to funds"
        value={formatInrExact(summary.toFundTotal)}
        sub={
          summary.toFundCount
            ? `${pct(summary.toFundTotal, summary.issuedTotal)}% · ${plural(summary.fundCount, 'fund')} · ${plural(summary.donorCount, 'donor')}`
            : 'None returned to a donor fund'
        }
      />
      <FigureTile
        label="By disbursement"
        value={`Tranches ${formatInrExact(tranches.amount)}`}
        sub={[
          `Lump sum ${formatInrExact(lump.amount)}`,
          none.count ? `No fund ${formatInrExact(none.amount)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <FigureTile label="By book" value={`LC ${formatInrExact(lc)}`} sub={`FC ${formatInrExact(fc)}`}>
        <BookSplitBar lc={lc} fc={fc} />
      </FigureTile>
    </FigureStrip>
  );
}

/** All credit notes — /credit-notes. Money that came back, optionally returned to a donor fund. */
export function CreditNotesPage() {
  const navigate = useNavigate();
  const notesQuery = useCreditNotes();
  const notes = useMemo(() => notesQuery.data || [], [notesQuery.data]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [moreOpen, setMoreOpen] = useState(false);

  // Financial year: null = not touched yet, so it follows the year marked
  // current; 'All' or an id once the user picks one.
  const [fyChoice, setFyChoice] = useState(null);
  const financialYearsQuery = useFinancialYears();
  const financialYears = useMemo(() => financialYearsQuery.data || [], [financialYearsQuery.data]);
  const currentFy = financialYears.find((fy) => fy.current) || null;
  const fyValue = fyChoice ?? (currentFy ? String(currentFy.id) : 'All');
  const selectedFy = financialYears.find((fy) => String(fy.id) === fyValue) || null;

  const donorOptions = useMemo(() => donorsOf(notes), [notes]);
  const filtered = useMemo(() => filterCreditNotes(notes, { ...filters, fy: selectedFy }), [notes, filters, selectedFy]);
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const anyFilter = hasActiveFilters(filters) || fyChoice !== null;
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setFyChoice(null);
  };

  // Filters tucked under "More filters" — counted on its button so none is hidden unnoticed.
  const moreCount = [filters.donor, filters.from, filters.to].filter(Boolean).length;

  // The summary follows the filters, so it always describes the rows shown below.
  const summary = useMemo(() => summarizeCreditNotes(filtered), [filtered]);
  const filteredIssuedTotal = summary.issuedTotal;

  const handleExport = () => {
    const csv = toCsv(
      [
        { header: 'Credit note', value: (n) => n.id },
        { header: 'Date received', value: (n) => n.date },
        { header: 'Book', value: (n) => n.book },
        { header: 'Donor', value: (n) => n.donor?.name },
        { header: 'Fund profile', value: (n) => n.fundProfile?.name },
        { header: 'Grant agreement', value: (n) => n.grant?.name },
        { header: 'Disbursement type', value: (n) => n.disbursementType },
        { header: 'Tranche', value: (n) => n.tranche?.name },
        { header: 'Received via', value: (n) => n.paymentMode?.name },
        { header: 'Into bank account', value: (n) => n.bankAccount?.name },
        { header: 'Group', value: (n) => n.group?.name },
        { header: 'Ledger / payment type', value: (n) => n.ledger?.name },
        { header: 'Reference', value: (n) => n.reference },
        { header: 'Tally voucher type', value: (n) => n.tallyVoucherType },
        { header: 'Tally voucher no.', value: (n) => n.tallyVoucherNo },
        { header: 'Remarks', value: (n) => n.remarks },
        { header: 'Attachment', value: (n) => n.attachment?.name },
        { header: 'Currency', value: (n) => n.currency },
        { header: 'Foreign amount', value: (n) => n.foreignAmount },
        { header: 'FX rate', value: (n) => n.fxRate },
        { header: 'Amount (INR)', value: (n) => n.amount },
        { header: 'Issued by', value: (n) => n.createdBy },
      ],
      filtered,
    );
    downloadCsv(`credit-notes-${new Date().toLocaleDateString('en-CA')}.csv`, csv);
  };

  const columns = [
    {
      key: 'id',
      header: 'Credit note',
      sortValue: (n) => n.date,
      render: (n) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12.5 }}>{n.id}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatDate(n.date)}</Typography>
        </Box>
      ),
    },
    {
      key: 'fund',
      header: 'Fund & Grant',
      sortValue: (n) => n.fundProfile?.name || null,
      render: (n) =>
        n.fundProfile || n.donor ? (
          <Box>
            <Typography variant="body2">{n.fundProfile?.name || '—'}</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              {[n.donor?.name, n.grant?.name].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Not returned to a fund
          </Typography>
        ),
    },
    {
      key: 'disbursement',
      header: 'Disbursement',
      sortValue: (n) => n.disbursementType || null,
      render: (n) =>
        n.disbursementType ? (
          <Box>
            <StatusChip label={n.disbursementType} tone={n.disbursementType === 'Tranches' ? 'info' : 'neutral'} />
            {n.tranche ? (
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, fontFamily: 'monospace' }}>
                {trancheCodeOf(n.tranche.name)}
              </Typography>
            ) : null}
          </Box>
        ) : (
          '—'
        ),
    },
    {
      key: 'receipt',
      header: 'Received via',
      sortValue: (n) => n.paymentMode?.name,
      render: (n) => (
        <Box>
          <Typography variant="body2">{n.paymentMode?.name || '—'}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {[n.bankAccount?.name, n.reference, n.tallyVoucherNo ? `Tally ${[n.tallyVoucherType, n.tallyVoucherNo].filter(Boolean).join(' ')}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'book',
      header: 'Book',
      sortValue: (n) => n.book,
      render: (n) => (n.book ? <StatusChip label={n.book} tone={BOOK_TONE[n.book]} /> : '—'),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortValue: (n) => n.amount,
      render: (n) => (
        <Box>
          <Box sx={{ ...MONEY_SX, fontWeight: 700, color: 'success.main' }}>{formatInrExact(n.amount)}</Box>
          {n.currency ? (
            <Typography variant="caption" color="text.secondary" sx={{ ...MONEY_SX, display: 'block' }}>
              {formatForeign(n.currency, n.foreignAmount)}
            </Typography>
          ) : null}
        </Box>
      ),
    },
  ];

  const footer =
    filtered.length > 0 ? (
      <TableFooter>
        <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
          <TableCell colSpan={5} sx={{ fontWeight: 600 }}>
            Total · {filtered.length} {filtered.length === 1 ? 'note' : 'notes'}
          </TableCell>
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700, color: 'success.main' }}>
            {formatInrExact(filteredIssuedTotal)}
          </TableCell>
        </TableRow>
      </TableFooter>
    ) : null;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        title="Credit Notes"
        subtitle="Money received back — refunds, reversed overcharges, rebates — and the donor fund it was returned to."
        actions={
          <Stack direction="row" spacing={1.5}>
            <Button color="inherit" onClick={() => navigate('/debit-notes')} sx={{ color: 'text.secondary' }}>
              Debit notes
            </Button>
            <Button variant="contained" color="success" startIcon={<AddIcon />} onClick={() => navigate('/credit-notes/new')}>
              New credit note
            </Button>
          </Stack>
        }
      />

      <CreditFigures
        summary={summary}
        period={selectedFy ? `${selectedFy.code} · ${formatDate(selectedFy.startDate)} – ${formatDate(selectedFy.endDate)}` : 'All financial years'}
        filtered={anyFilter}
        onClearFilters={clearFilters}
      />

      {/* Filter bar: the common filters in one row, the rest under "More filters". */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ p: 1.5, alignItems: { md: 'center' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchField placeholder="Search note, donor, fund, tranche, reference or Tally no." value={filters.query} onChange={setFilter('query')} />
          </Box>
          <TextField
            select
            size="small"
            value={fyValue}
            onChange={(e) => setFyChoice(e.target.value)}
            disabled={financialYearsQuery.isLoading}
            error={financialYearsQuery.isError}
            sx={{ minWidth: 190 }}
            slotProps={{ htmlInput: { 'aria-label': 'Financial year' } }}
          >
            <MenuItem value="All">All financial years</MenuItem>
            {financialYears.map((fy) => (
              <MenuItem key={fy.id} value={String(fy.id)}>
                {fy.code}
                {fy.current ? ' · current' : ''}
              </MenuItem>
            ))}
          </TextField>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={filters.book}
            onChange={(_, value) => value && setFilter('book')(value)}
            aria-label="Book"
          >
            {['All', 'LC', 'FC'].map((b) => (
              <ToggleButton key={b} value={b} sx={{ px: 1.75, fontWeight: 600, textTransform: 'none' }}>
                {b === 'All' ? 'All books' : b}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Badge color="success" badgeContent={moreCount} invisible={!moreCount}>
              <Button
                variant={moreOpen ? 'contained' : 'outlined'}
                color="inherit"
                startIcon={<TuneIcon />}
                onClick={() => setMoreOpen((o) => !o)}
                aria-expanded={moreOpen}
                sx={{ whiteSpace: 'nowrap' }}
              >
                More filters
              </Button>
            </Badge>
            <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => navigate('/credit-notes/import')} sx={{ whiteSpace: 'nowrap' }}>
              Import
            </Button>
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={handleExport}
              disabled={!filtered.length}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Export
            </Button>
          </Stack>
        </Stack>
        <Collapse in={moreOpen}>
          <Grid container spacing={1.5} sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
            <Grid size={{ xs: 12, md: 6 }} sx={{ pt: 1.5 }}>
              <Autocomplete
                size="small"
                options={donorOptions}
                value={filters.donor}
                onChange={(_, donor) => setFilter('donor')(donor || null)}
                getOptionLabel={(d) => d.name}
                isOptionEqualToValue={(a, b) => String(a.id ?? a.name) === String(b.id ?? b.name)}
                renderInput={(params) => <TextField {...params} label="Donor" placeholder="All donors" />}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }} sx={{ pt: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="From"
                value={filters.from}
                onChange={(e) => setFilter('from')(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: filters.to || undefined } }}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }} sx={{ pt: 1.5 }}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="To"
                value={filters.to}
                onChange={(e) => setFilter('to')(e.target.value)}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: filters.from || undefined } }}
              />
            </Grid>
          </Grid>
        </Collapse>
      </Card>

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(n) => n.id}
        isLoading={notesQuery.isPending}
        error={notesQuery.isError ? notesQuery.error : null}
        onRetry={notesQuery.refetch}
        defaultSort={{ key: 'id', direction: 'desc' }}
        footer={footer}
        onRowClick={(n) => navigate(`/credit-notes/${n.id}`)}
        emptyTitle={notes.length ? 'No credit notes match these filters' : 'No credit notes yet'}
        emptyDescription={
          !notes.length
            ? 'Raise a credit note when money comes back — a refund, a rebate.'
            : selectedFy && !hasActiveFilters(filters)
              ? `Nothing recorded in ${selectedFy.code} — pick another financial year or All financial years.`
              : 'Try another financial year, widening the date range, or clearing filters.'
        }
      />
    </Box>
  );
}
