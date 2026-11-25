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
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import { useNavigate } from 'react-router-dom';
import { DataTable, PageHeader, SearchField, StatusChip } from '../../../shared/components/index.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { downloadCsv, toCsv } from '../../../lib/export/csv.js';
import { useFinancialYears } from '../../financial-year/hooks/useFinancialYears.js';
import { useOutflowRows } from '../../outflow-budget/hooks/useOutflow.js';
import { BOOK_TONE } from '../../../shared/constants/book.js';
import { useDebitNotes } from '../hooks/useDebitNotes.js';
import { BookSplitBar, FigureStrip, FigureTile, MONEY_SX, pct, plural } from '../../credit-notes/components/NoteLayout.jsx';
import { summarizeDebitNotes } from '../lib/summarizeDebitNotes.js';
import { donorsOf, EMPTY_FILTERS, filterDebitNotes, hasActiveFilters } from '../lib/filterDebitNotes.js';
import { PAYEE_CATEGORIES } from '../constants.js';
import { useOverBudgetReasons } from '../../masters/hooks/useOverBudgetReasons.js';

const payeeCategoryLabel = (code) => PAYEE_CATEGORIES.find((c) => c.value === code)?.label || '';
/**
 * The figures for the notes listed below (they follow the filters): what went
 * out, how much was charged to donor funds, how much was over budget, and the
 * LC / FC split.
 */
function DebitFigures({ summary, period, filtered, onClearFilters }) {
  const lc = summary.byBook.LC.amount;
  const fc = summary.byBook.FC.amount;
  return (
    <FigureStrip period={period} count={summary.issuedCount} filtered={filtered} onClearFilters={onClearFilters}>
      <FigureTile
        label="Total debited"
        value={formatInrExact(summary.issuedTotal)}
        color={summary.issuedTotal ? 'error.main' : 'text.disabled'}
        sub={`${plural(summary.issuedCount, 'note')} · ${plural(summary.lineCount, 'line')}`}
      />
      <FigureTile
        label="Charged to funds"
        value={formatInrExact(summary.toFund.amount)}
        sub={
          summary.toFund.count
            ? `${pct(summary.toFund.amount, summary.issuedTotal)}% · ${plural(summary.fundCount, 'fund')} · ${plural(summary.donorCount, 'donor')}`
            : 'None charged to a donor fund'
        }
      />
      <FigureTile
        label="Over budget"
        value={formatInrExact(summary.overBudget.amount)}
        color={summary.overBudget.amount ? 'warning.main' : undefined}
        sub={
          summary.overBudget.count
            ? `${plural(summary.overBudget.count, 'note')} · ${formatInrExact(summary.withinBudget.amount)} within budget`
            : 'All within budget'
        }
      />
      <FigureTile label="By book" value={`LC ${formatInrExact(lc)}`} sub={`FC ${formatInrExact(fc)}`}>
        <BookSplitBar lc={lc} fc={fc} />
      </FigureTile>
    </FigureStrip>
  );
}

/** All debit notes — /debit-notes. Every note adds to Spent on the Outflow Budget. */
export function DebitNotesPage() {
  const navigate = useNavigate();
  const notesQuery = useDebitNotes();
  const notes = useMemo(() => notesQuery.data || [], [notesQuery.data]);
  const linesQuery = useOutflowRows();
  const lines = useMemo(() => linesQuery.data || [], [linesQuery.data]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Reason filter: every reason in Masters (active or not), plus any name already on a note.
  const reasonsQuery = useOverBudgetReasons('');
  const reasonNames = [...new Set([...(reasonsQuery.data || []).map((r) => r.name), ...(notesQuery.data || []).map((n) => n.reason).filter(Boolean)])].sort();
  const [moreOpen, setMoreOpen] = useState(false);

  // Financial year: null = not touched yet, so it follows the year marked
  // current; 'All' or an id once the user picks one.
  const [fyChoice, setFyChoice] = useState(null);
  const financialYearsQuery = useFinancialYears();
  const financialYears = useMemo(() => financialYearsQuery.data || [], [financialYearsQuery.data]);
  const currentFy = financialYears.find((fy) => fy.current) || null;
  const fyValue = fyChoice ?? (currentFy ? String(currentFy.id) : 'All');
  const selectedFy = financialYears.find((fy) => String(fy.id) === fyValue) || null;

  const lineById = useMemo(() => Object.fromEntries(lines.map((l) => [l.id, l])), [lines]);
  const donorOptions = useMemo(() => donorsOf(notes), [notes]);
  const filtered = useMemo(
    () => filterDebitNotes(notes, { ...filters, fy: selectedFy }, lineById),
    [notes, filters, selectedFy, lineById],
  );
  const setFilter = (key) => (value) => setFilters((f) => ({ ...f, [key]: value }));
  const anyFilter = hasActiveFilters(filters) || fyChoice !== null;
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setFyChoice(null);
  };

  // Filters tucked under "More filters" — counted on its button so none is hidden unnoticed.
  const moreCount = [filters.lineId, filters.donor, filters.reason !== 'All', filters.from, filters.to].filter(Boolean).length;

  // The summary follows the filters, so it always describes the rows shown below.
  const summary = useMemo(() => summarizeDebitNotes(filtered), [filtered]);

  const handleExport = () => {
    const csv = toCsv(
      [
        { header: 'Debit note', value: (n) => n.id },
        { header: 'Date', value: (n) => n.date },
        { header: 'Book', value: (n) => n.book },
        { header: 'Outflow line', value: (n) => n.outflowLineId },
        { header: 'Line description', value: (n) => lineById[n.outflowLineId]?.line || n.lineDescription || '' },
        { header: 'Reason', value: (n) => n.reason || '' },
        { header: 'Payee category', value: (n) => payeeCategoryLabel(n.payeeCategory) },
        { header: 'Payee', value: (n) => n.payee?.name },
        { header: 'Payment mode', value: (n) => n.paymentMode?.name },
        { header: 'Bank account', value: (n) => n.bankAccount?.name },
        { header: 'Reference', value: (n) => n.reference },
        { header: 'Tally voucher type', value: (n) => n.tallyVoucherType },
        { header: 'Tally voucher no.', value: (n) => n.tallyVoucherNo },
        { header: 'Group', value: (n) => n.group?.name },
        { header: 'Ledger / payment type', value: (n) => n.ledger?.name },
        { header: 'Donor', value: (n) => n.donor?.name },
        { header: 'Fund profile', value: (n) => n.fundProfile?.name },
        { header: 'Grant agreement', value: (n) => n.grant?.name },
        { header: 'Remarks', value: (n) => n.remarks },
        { header: 'Attachment', value: (n) => n.attachment?.name },
        { header: 'Amount (INR)', value: (n) => n.amount },
        { header: 'Issued by', value: (n) => n.createdBy },
      ],
      filtered,
    );
    downloadCsv(`debit-notes-${new Date().toLocaleDateString('en-CA')}.csv`, csv);
  };

  const columns = [
    {
      key: 'id',
      header: 'Debit note',
      sortValue: (n) => n.date,
      render: (n) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: 12.5 }}>{n.id}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{formatDate(n.date)}</Typography>
        </Box>
      ),
    },
    {
      key: 'outflowLineId',
      header: 'Outflow line',
      sortValue: (n) => n.outflowLineId,
      render: (n) => (
        <Box>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5 }}>{n.outflowLineId}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {lineById[n.outflowLineId]?.line || n.lineDescription || 'Unknown line'}
          </Typography>
          {n.reason ? (
            <Typography variant="caption" sx={{ color: 'warning.main', display: 'block', fontWeight: 600 }}>
              Over budget · {n.reason}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'payee',
      header: 'Payee',
      sortValue: (n) => n.payee?.name,
      render: (n) => (
        <Box>
          <Typography variant="body2">{n.payee?.name || '—'}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {[payeeCategoryLabel(n.payeeCategory), n.paymentMode?.name, n.reference, n.tallyVoucherNo ? `Tally ${[n.tallyVoucherType, n.tallyVoucherNo].filter(Boolean).join(' ')}` : null]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
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
          <Typography variant="body2" color="text.secondary">Not charged to a fund</Typography>
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
        <Box sx={{ ...MONEY_SX, fontWeight: 700, color: 'error.main' }}>
          {formatInrExact(n.amount)}
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
          <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700, color: 'error.main' }}>
            {formatInrExact(summary.issuedTotal)}
          </TableCell>
        </TableRow>
      </TableFooter>
    ) : null;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        title="Debit Notes"
        subtitle="Extra money paid out against an outflow budget line — added to Spent, and optionally charged to a donor fund."
        actions={
          <Stack direction="row" spacing={1.5}>
            <Button color="inherit" onClick={() => navigate('/credit-notes')} sx={{ color: 'text.secondary' }}>
              Credit notes
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('/debit-notes/new')}>
              New debit note
            </Button>
          </Stack>
        }
      />

      <DebitFigures
        summary={summary}
        period={selectedFy ? `${selectedFy.code} · ${formatDate(selectedFy.startDate)} – ${formatDate(selectedFy.endDate)}` : 'All financial years'}
        filtered={anyFilter}
        onClearFilters={clearFilters}
      />

      {/* Filter bar: the common filters in one row, the rest under "More filters". */}
      <Card variant="outlined" sx={{ mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} sx={{ p: 1.5, alignItems: { md: 'center' } }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <SearchField placeholder="Search note, line, payee, fund, reference or Tally no." value={filters.query} onChange={setFilter('query')} />
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
            <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => navigate('/debit-notes/import')} sx={{ whiteSpace: 'nowrap' }}>
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
          <Grid container spacing={1.5} sx={{ px: 1.5, pb: 1.5, pt: 0.5, borderTop: '1px solid', borderColor: 'divider', mt: 0 }}>
            <Grid size={{ xs: 12, md: 3 }} sx={{ pt: 1.5 }}>
              <Autocomplete
                size="small"
                options={lines}
                value={filters.lineId ? lineById[filters.lineId] || null : null}
                onChange={(_, line) => setFilter('lineId')(line?.id || null)}
                getOptionLabel={(l) => `${l.budgetCode} · ${l.lineCode} · Q${l.quarter} — ${l.line}`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                renderInput={(params) => <TextField {...params} label="Outflow line" placeholder="All lines" />}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }} sx={{ pt: 1.5 }}>
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
            <Grid size={{ xs: 12, sm: 6, md: 2 }} sx={{ pt: 1.5 }}>
              <TextField select fullWidth size="small" label="Reason" value={filters.reason} onChange={(e) => setFilter('reason')(e.target.value)}>
                <MenuItem value="All">All reasons</MenuItem>
                {reasonNames.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 6, md: 2 }} sx={{ pt: 1.5 }}>
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
            <Grid size={{ xs: 6, md: 2 }} sx={{ pt: 1.5 }}>
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
        onRowClick={(n) => navigate(`/debit-notes/${n.id}`)}
        emptyTitle={notes.length ? 'No debit notes match these filters' : 'No debit notes yet'}
        emptyDescription={
          !notes.length
            ? 'Raise a debit note when extra money goes out against an outflow line.'
            : selectedFy && !hasActiveFilters(filters)
              ? `Nothing recorded in ${selectedFy.code} — pick another financial year or All financial years.`
              : 'Try another financial year, widening the date range, or clearing filters.'
        }
      />
    </Box>
  );
}
