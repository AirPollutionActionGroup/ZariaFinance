/**
 * Transactions tab of /funding/:id — the credit notes received into this
 * grant and the debit notes charged to it: money in / out / net for the
 * current filter, a running balance per row, and a CSV of what is shown.
 */
import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Select,
  Stack,
  TableCell,
  TableFooter,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import SouthWestRoundedIcon from '@mui/icons-material/SouthWestRounded';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { DataTable } from '../../../shared/components/index.js';
import { formatDate } from '../../../lib/format/date.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { downloadCsv, toCsv } from '../../../lib/export/csv.js';
import { useFinancialYears } from '../../financial-year/hooks/useFinancialYears.js';

/** "FY 2026-27" whether or not the stored code already starts with FY. */
const fyLabel = (fy) => (/^FY/i.test(fy.code) ? fy.code : `FY ${fy.code}`);

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };
const IN = 'CREDIT';
const OUT = 'DEBIT';

/** Money in (credit) / out (debit) as an arrow badge. */
function Direction({ type }) {
  const incoming = type === IN;
  const Icon = incoming ? SouthWestRoundedIcon : NorthEastRoundedIcon;
  return (
    <Box
      aria-hidden
      sx={{
        width: 28,
        height: 28,
        borderRadius: 1.5,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: incoming ? 'var(--ok-bg)' : 'var(--err-bg)',
        color: incoming ? 'var(--ok)' : 'var(--err)',
      }}
    >
      <Icon sx={{ fontSize: 16 }} />
    </Box>
  );
}

/** One figure of the summary strip. */
function Figure({ label, value, note, color }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={SMALL_CAPS}>{label}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35, fontVariantNumeric: 'tabular-nums', color }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{note}</Typography>
    </Box>
  );
}

const signed = (r) => (r.type === IN ? 1 : -1) * (Number(r.amount) || 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Adds the running balance in date order (oldest first) and returns the rows newest first. */
function withRunningBalance(rows) {
  const ordered = [...rows].sort(
    (a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id).localeCompare(String(b.id)),
  );
  const out = [];
  ordered.reduce((balance, t) => {
    const next = balance + signed(t);
    out.push({ ...t, balance: next });
    return next;
  }, 0);
  return out.reverse();
}

export function FundingTransactions({ transactions, isLoading, error, onRetry, navigate, exportName = 'transactions' }) {
  const [direction, setDirection] = useState('all');
  // null = not touched yet → the current financial year; 'All' / an id once picked.
  const [fyFilter, setFyFilter] = useState(null);
  const [recordAnchor, setRecordAnchor] = useState(null);

  const financialYears = useFinancialYears().data || [];
  const currentFy = financialYears.find((fy) => fy.current) || null;
  const effectiveFy = fyFilter ?? (currentFy ? String(currentFy.id) : 'All');
  const selectedFy = financialYears.find((fy) => String(fy.id) === effectiveFy) || null;

  const inYear = useMemo(
    () => transactions.filter((t) => !selectedFy || (t.date >= selectedFy.startDate && t.date <= selectedFy.endDate)),
    [transactions, selectedFy],
  );
  const shown = useMemo(() => {
    const filtered = inYear.filter((t) => direction === 'all' || (direction === 'in' ? t.type === IN : t.type === OUT));
    return withRunningBalance(filtered);
  }, [inYear, direction]);

  const ins = inYear.filter((t) => t.type === IN);
  const outs = inYear.filter((t) => t.type === OUT);
  const totalIn = ins.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalOut = outs.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const shownNet = shown.reduce((s, t) => s + signed(t), 0);
  const period = selectedFy ? fyLabel(selectedFy) : 'all years';

  const columns = [
    {
      key: 'id',
      header: 'Note',
      width: 190,
      sortValue: (r) => r.id,
      render: (r) => (
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Direction type={r.type} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.id}</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{r.type === IN ? 'Credit note · in' : 'Debit note · out'}</Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'date', header: 'Date', width: 110, sx: { whiteSpace: 'nowrap' }, sortValue: (r) => r.date, render: (r) => formatDate(r.date) },
    {
      key: 'party',
      header: 'From / to',
      sortValue: (r) => r.partyName,
      render: (r) => (
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{r.partyName}</Typography>
          {r.purpose ? (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontFamily: r.type === IN ? 'monospace' : undefined }}>
              {r.type === IN ? `Tranche ${r.purpose}` : r.purpose}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'mode',
      header: 'Paid via',
      width: 170,
      render: (r) => (
        <Box>
          <Typography variant="body2">{r.paymentModeLabel}</Typography>
          {r.reference ? <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Ref {r.reference}</Typography> : null}
        </Box>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      width: 150,
      align: 'right',
      sortValue: (r) => signed(r),
      render: (r) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: r.type === OUT ? 'error.main' : 'success.main' }}>
            {r.type === OUT ? '−' : '+'}
            {formatInrExact(r.amount)}
          </Typography>
          {r.foreign ? (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
              {r.foreign.currency} {r.foreign.amount.toLocaleString('en-IN')}
            </Typography>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      width: 130,
      align: 'right',
      render: (r) => (
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: r.balance < 0 ? 'error.main' : 'text.secondary' }}>
          {formatInrExact(r.balance)}
        </Typography>
      ),
    },
  ];

  const exportCsv = () => {
    const csv = toCsv(
      [
        { header: 'Note', value: (r) => r.id },
        { header: 'Type', value: (r) => (r.type === IN ? 'Credit (in)' : 'Debit (out)') },
        { header: 'Date', value: (r) => r.date, asText: true },
        { header: 'From / to', value: (r) => r.partyName },
        { header: 'For', value: (r) => r.purpose || '' },
        { header: 'Payment mode', value: (r) => r.paymentModeLabel },
        { header: 'Reference', value: (r) => r.reference || '', asText: true },
        { header: 'Amount (INR)', value: (r) => signed(r) },
        { header: 'Foreign amount', value: (r) => (r.foreign ? `${r.foreign.currency} ${r.foreign.amount}` : '') },
        { header: 'Running balance (INR)', value: (r) => r.balance },
      ],
      [...shown].reverse(),
    );
    downloadCsv(`${exportName}-${period.replace(/\s+/g, '-')}.csv`, csv);
  };

  const toolbar = (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={direction}
        onChange={(_e, v) => v && setDirection(v)}
        aria-label="Money in or out"
        sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.4, textTransform: 'none', fontWeight: 600, fontSize: 13 } }}
      >
        <ToggleButton value="all">All · {inYear.length}</ToggleButton>
        <ToggleButton value="in">In · {ins.length}</ToggleButton>
        <ToggleButton value="out">Out · {outs.length}</ToggleButton>
      </ToggleButtonGroup>
      <Select
        size="small"
        value={effectiveFy}
        onChange={(e) => setFyFilter(e.target.value)}
        inputProps={{ 'aria-label': 'Financial year' }}
        sx={{ minWidth: 140, height: 32, fontSize: 13, borderRadius: 2 }}
      >
        <MenuItem value="All">All years</MenuItem>
        {financialYears.map((fy) => (
          <MenuItem key={fy.id} value={String(fy.id)}>
            {fyLabel(fy)}
          </MenuItem>
        ))}
      </Select>
      <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={exportCsv} disabled={!shown.length}>
        CSV
      </Button>
      <Button
        size="small"
        variant="contained"
        startIcon={<AddIcon />}
        endIcon={<ExpandMoreRoundedIcon />}
        aria-haspopup="menu"
        onClick={(e) => setRecordAnchor(e.currentTarget)}
      >
        Record
      </Button>
      <Menu
        anchorEl={recordAnchor}
        open={Boolean(recordAnchor)}
        onClose={() => setRecordAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem onClick={() => navigate('/credit-notes/new')}>
          <ListItemIcon sx={{ color: 'var(--ok)' }}>
            <SouthWestRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Credit note" secondary="Money received" />
        </MenuItem>
        <MenuItem onClick={() => navigate('/debit-notes/new')}>
          <ListItemIcon sx={{ color: 'var(--err)' }}>
            <NorthEastRoundedIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Debit note" secondary="Money paid out" />
        </MenuItem>
      </Menu>
    </Stack>
  );

  const footer = shown.length ? (
    <TableFooter>
      <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
        <TableCell colSpan={4} sx={{ fontWeight: 600 }}>
          Net · {plural(shown.length, 'note', 'notes')} · {period}
        </TableCell>
        <TableCell align="right" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: shownNet < 0 ? 'error.main' : 'text.primary' }}>
          {shownNet < 0 ? '−' : ''}
          {formatInrExact(Math.abs(shownNet))}
        </TableCell>
        <TableCell />
      </TableRow>
    </TableFooter>
  ) : null;

  return (
    <Stack spacing={2}>
      <Card sx={{ px: 2.5, py: 1.75 }}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' } }}>
          <Figure label={`Money in · ${period}`} value={formatInrExact(totalIn)} color={totalIn ? 'success.main' : undefined} note={plural(ins.length, 'credit note', 'credit notes')} />
          <Figure label="Money out" value={formatInrExact(totalOut)} color={totalOut ? 'error.main' : undefined} note={plural(outs.length, 'debit note', 'debit notes')} />
          <Figure label="Net" value={`${totalIn - totalOut < 0 ? '−' : ''}${formatInrExact(Math.abs(totalIn - totalOut))}`} note="In − out" />
        </Box>
      </Card>
      <DataTable
        dense
        title="Transactions"
        actions={toolbar}
        columns={columns}
        rows={shown}
        getRowKey={(r) => `${r.type}-${r.id}`}
        isLoading={isLoading}
        error={error}
        onRetry={onRetry}
        onRowClick={(r) => navigate(r.href)}
        footer={footer}
        emptyTitle={transactions.length ? 'Nothing in this view' : 'No credit or debit notes yet'}
        emptyDescription={
          transactions.length
            ? `No ${direction === 'in' ? 'credit' : direction === 'out' ? 'debit' : ''} notes in ${period} — try All years.`
            : 'Money received into this grant (credit notes) and paid from it (debit notes) shows here.'
        }
      />
    </Stack>
  );
}
