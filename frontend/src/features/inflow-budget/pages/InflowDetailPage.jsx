import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import VolunteerActivismOutlinedIcon from '@mui/icons-material/VolunteerActivismOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { ErrorState, LoadingState, RecordHeader, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { BOOK } from '../../../shared/constants/book.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { useInflowBudgetLine } from '../hooks/useInflowBudget.js';
import { toInflowView } from '../lib/inflowView.js';
import { printHtml, trancheSheetHtml, trancheWorkbook } from '../lib/inflowSheet.js';
import { inflowReceiptsCsv } from '../lib/inflowExport.js';
import { downloadCsv } from '../../../lib/export/csv.js';
import { downloadXlsx } from '../../../lib/export/xlsx.js';
import { useAuth } from '../../../core/auth/index.js';
import { FUNDING_SOURCE_TYPE, RECEIPT_STATUS } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };
const SMALL_CAPS = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };
const STATUS_COLOR = {
  [RECEIPT_STATUS.OVERDUE]: 'error.main',
  [RECEIPT_STATUS.PENDING]: 'warning.main',
  [RECEIPT_STATUS.RECEIVED]: 'success.main',
};
/** Status label → chip tone. */
const STATUS_TONE = { Received: 'success', Due: 'neutral', Pending: 'warning', Overdue: 'error' };
const SOURCE_COLOR = { RESTRICTED: 'var(--warn)', UNRESTRICTED: 'var(--muted)', CORPUS: 'var(--info)' };

function SectionCard({ title, aside, children }) {
  return (
    <Card>
      <CardContent sx={{ px: 2.5, py: 2, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.75, gap: 1 }}>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {aside}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

/** Label / value row of a facts card. */
function FactRow({ label, children }) {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      spacing={2}
      sx={{ py: 1, borderBottom: '1px solid var(--line2)', '&:last-of-type': { borderBottom: 'none' } }}
    >
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" component="div" sx={{ ...MONEY_SX, fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Stack>
  );
}

/** Collection meter under the KPI strip; past 100% when the donor sent more than expected. */
function CollectedBar({ expected, received }) {
  const share = expected > 0 ? Math.round((received / expected) * 100) : 0;
  const scale = Math.max(expected, received, 1);
  const w = (v) => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;
  return (
    <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>Collected</Typography>
        <Typography variant="caption" sx={{ ...MONEY_SX, fontWeight: 700, color: share >= 100 ? 'success.main' : 'text.primary' }}>
          {share}% of expected
        </Typography>
      </Stack>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: w(received), bgcolor: 'var(--ok)', borderRadius: 4, transition: 'width .3s ease' }} />
        {received > expected ? <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: w(expected), width: 2, bgcolor: 'background.paper' }} /> : null}
      </Box>
    </Box>
  );
}

/** Each instalment received on the tranche — the credit notes raised against it. */
function ReceiptsTable({ receipts, navigate, onAdd, canAdd }) {
  if (!receipts.length) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 4, px: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
        <ReceiptLongOutlinedIcon sx={{ color: 'text.disabled', fontSize: 32 }} />
        <Typography variant="body1" sx={{ fontWeight: 600 }}>Nothing received yet</Typography>
        <Typography variant="body2" color="text.secondary">
          Raise a credit note against this tranche when the donor&apos;s money comes in — it shows up here automatically.
        </Typography>
        {canAdd ? (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAdd} sx={{ mt: 1 }}>
            New credit note
          </Button>
        ) : null}
      </Stack>
    );
  }

  const total = receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  return (
    <TableContainer sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Table size="small" sx={{ '& th': { ...SMALL_CAPS, whiteSpace: 'nowrap', bgcolor: 'var(--thead)' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Credit note</TableCell>
            <TableCell>Receipt ref / UTR</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {receipts.map((r, i) => (
            <TableRow key={r.creditNoteId} hover onClick={() => navigate(`/credit-notes/${r.creditNoteId}`)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 11.5,
                      fontWeight: 700,
                      bgcolor: 'var(--ok-bg)',
                      color: 'var(--ok)',
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.creditNoteId}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(r.date)}</Typography>
                  </Box>
                </Stack>
              </TableCell>
              <TableCell>
                <Typography variant="body2" color={r.reference ? 'text.primary' : 'text.secondary'} sx={{ overflowWrap: 'anywhere' }}>
                  {r.reference || '—'}
                </Typography>
              </TableCell>
              <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700, color: 'success.main', whiteSpace: 'nowrap' }}>
                {formatInrExact(r.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
            <TableCell colSpan={2} sx={{ fontWeight: 600 }}>
              Total received · {receipts.length} {receipts.length === 1 ? 'instalment' : 'instalments'}
            </TableCell>
            <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700, color: 'success.main' }}>{formatInrExact(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}

/** "₹93.7650" — an FX rate as stored (4 decimals), without rounding it away. */
function formatRate(rate) {
  const n = Number(rate);
  return Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : '—';
}

/**
 * The foreign-currency side of an FC tranche: what the donor sends in their
 * currency, the rate the INR figures came from, and what is still to come in that currency.
 */
function ForeignContribution({ row, outstanding }) {
  const fc = row.foreign;
  const fcra = (
    <FactRow label="FCRA">
      <StatusChip label={row.fcraApplicable ? 'Applicable' : 'Not applicable'} tone={row.fcraApplicable ? 'warning' : 'outlined'} />
    </FactRow>
  );

  if (!fc) {
    return (
      <SectionCard title="Foreign contribution">
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Saved before the currency, foreign amount and FX rate were recorded, so only INR figures are available.
          {row.fundProfileId ? (
            <>
              {' '}
              <Link component={RouterLink} to={`/funding/${row.fundProfileId}/edit`}>Add them on the funding record</Link>.
            </>
          ) : null}
        </Alert>
        {fcra}
      </SectionCard>
    );
  }

  const rate = Number(fc.fxRate) || 0;
  const share =
    fc.expectedForeignAmount != null && Number(fc.commitmentForeignAmount) > 0
      ? Math.round((Number(fc.expectedForeignAmount) / Number(fc.commitmentForeignAmount)) * 1000) / 10
      : null;
  const outstandingForeign = outstanding > 0 && rate > 0 ? outstanding / rate : null;

  return (
    <SectionCard title="Foreign contribution" aside={<StatusChip label={fc.currency} tone="graphite" />}>
      <FactRow label={`Expected in ${fc.currency}`}>
        {fc.expectedForeignAmount != null ? formatForeign(fc.currency, fc.expectedForeignAmount) : '—'}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>= {formatInrExact(row.expectedAmount)}</Typography>
      </FactRow>
      <FactRow label="FX rate">
        {formatRate(fc.fxRate)} / {fc.currency}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {[fc.fxRateSourceLabel, fc.fxRateDate ? formatDate(fc.fxRateDate) : null].filter(Boolean).join(' · ') || '—'}
        </Typography>
      </FactRow>
      <FactRow label="Whole commitment">
        {formatForeign(fc.currency, fc.commitmentForeignAmount)}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          = {formatInrExact(fc.commitmentInrAmount)}{share != null ? ` · this tranche ${share}%` : ''}
        </Typography>
      </FactRow>
      <FactRow label={`Outstanding in ${fc.currency}`}>
        {outstandingForeign ? `≈ ${formatForeign(fc.currency, Math.round(outstandingForeign * 100) / 100)}` : '—'}
      </FactRow>
      {fcra}
    </SectionCard>
  );
}

/** Single grant tranche — /inflow-budget/:id. */
export function InflowDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lineQuery = useInflowBudgetLine(id);
  const row = lineQuery.data;
  const asAt = useMemo(() => new Date(), []);
  const { user } = useAuth();
  const [exportAnchor, setExportAnchor] = useState(null);
  const [exportNote, setExportNote] = useState(null);

  const back = (
    <Button startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 1, color: 'text.secondary' }} onClick={() => navigate('/inflow-budget')}>
      Inflow budget
    </Button>
  );

  if (lineQuery.isPending) return <LoadingState label="Loading tranche…" />;
  if (lineQuery.isError || !row) {
    return (
      <>
        {back}
        <ErrorState error={lineQuery.error || { message: `No tranche found for "${id}".` }} onRetry={lineQuery.refetch} />
      </>
    );
  }

  const view = toInflowView(row, asAt);
  const { status, expected, received, fy } = view;
  const outstanding = expected - received;
  const receipts = row.receipts || [];
  const late = view.daysLate;
  const fc = row.foreign;

  // Export: a printable tranche sheet (PDF), an Excel workbook, or the receipts as CSV.
  const fileBase = `${row.trancheCode || `tranche-${row.id}`}-${asAt.toLocaleDateString('en-CA')}`;
  const exportAs = (kind) => {
    setExportAnchor(null);
    setExportNote(null);
    if (kind === 'pdf') {
      if (!printHtml(trancheSheetHtml(view, { printedBy: user?.name, printedAt: asAt }))) {
        setExportNote('Your browser blocked the new window — allow pop-ups for this site and try again.');
      }
    } else if (kind === 'xlsx') {
      downloadXlsx(`${fileBase}.xlsx`, trancheWorkbook(view));
    } else {
      downloadCsv(`${fileBase}-receipts.csv`, inflowReceiptsCsv([view]));
    }
  };
  const addCreditNote = () => navigate('/credit-notes/new');
  const canAdd = outstanding > 0;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <RecordHeader
        breadcrumbs={[
          { label: 'Inflow budget', onClick: () => navigate('/inflow-budget') },
          ...(row.fundProfileId ? [{ label: row.profileCode || `Funding #${row.fundProfileId}`, onClick: () => navigate(`/funding/${row.fundProfileId}`) }] : []),
          { label: row.trancheCode || `Tranche ${row.id}` },
        ]}
        icon={VolunteerActivismOutlinedIcon}
        iconHint="Grant tranche"
        eyebrow={[row.profileCode, row.trancheCode, fy ? `FY ${fy}` : null].filter(Boolean).join(' · ')}
        title={row.line}
        status={<StatusChip label={status} tone={STATUS_TONE[status]} />}
        meta={[
          { label: row.donor || '—', strong: true, hint: 'Donor' },
          { dot: SOURCE_COLOR[row.fundingSource] || 'var(--muted)', label: FUNDING_SOURCE_TYPE[row.fundingSource] || row.fundingSource, hint: 'Funding source' },
          { icon: AccountBalanceWalletOutlinedIcon, label: `${row.book} · ${BOOK[row.book] || ''}`, hint: 'Book' },
          { icon: EventOutlinedIcon, label: `Expected ${formatDate(row.expectedDate)}` },
        ]}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<FileDownloadOutlinedIcon />}
              onClick={(e) => setExportAnchor(e.currentTarget)}
              aria-haspopup="menu"
            >
              Export
            </Button>
            <Menu anchorEl={exportAnchor} open={Boolean(exportAnchor)} onClose={() => setExportAnchor(null)}>
              <MenuItem onClick={() => exportAs('pdf')}>
                <ListItemIcon><PictureAsPdfOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Tranche sheet (PDF)" secondary="A4 page — figures, tranche and FX details, receipts, sign-off" />
              </MenuItem>
              <MenuItem onClick={() => exportAs('xlsx')}>
                <ListItemIcon><GridOnOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Excel workbook (.xlsx)" secondary="Summary with live formulas, receipts with a total" />
              </MenuItem>
              <MenuItem onClick={() => exportAs('csv')} disabled={!receipts.length}>
                <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary={`Receipts (CSV) · ${receipts.length}`} secondary="One row per credit note — date, UTR, amount" />
              </MenuItem>
            </Menu>
            {row.fundProfileId ? (
              <Button
                variant="outlined"
                endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => navigate(`/funding/${row.fundProfileId}`)}
              >
                Funding record
              </Button>
            ) : null}
            {canAdd ? (
              <Button variant="contained" startIcon={<AddIcon />} onClick={addCreditNote}>
                New credit note
              </Button>
            ) : null}
          </Stack>
        }
      />

      {exportNote ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setExportNote(null)}>{exportNote}</Alert>
      ) : null}

      <StatStrip
        sx={{ mb: 2 }}
        stats={[
          {
            label: 'Expected',
            value: formatInrExact(expected),
            note: fc?.expectedForeignAmount != null ? `${formatForeign(fc.currency, fc.expectedForeignAmount)} · due ${formatDate(row.expectedDate)}` : `due ${formatDate(row.expectedDate)}`,
          },
          {
            label: 'Received',
            value: formatInrExact(received),
            note: receipts.length
              ? `${receipts.length} ${receipts.length === 1 ? 'instalment' : 'instalments'} · last ${formatDate(row.actualDate)}`
              : 'nothing yet',
            color: received ? 'success.main' : undefined,
          },
          {
            label: outstanding < 0 ? 'Received extra' : 'Outstanding',
            value: outstanding === 0 ? '—' : formatInrExact(Math.abs(outstanding)),
            note: outstanding > 0 ? 'still to come from the donor' : outstanding < 0 ? 'more than expected' : 'fully received',
            color: outstanding > 0 ? 'warning.main' : undefined,
          },
          {
            label: 'Status',
            value: status,
            note: late
              ? `${late} ${late === 1 ? 'day' : 'days'} past the expected date`
              : status === RECEIPT_STATUS.RECEIVED
                ? row.actualDate && new Date(row.actualDate) <= new Date(row.expectedDate) ? 'received on time' : 'received late'
                : 'expected date not reached',
            color: STATUS_COLOR[status],
          },
        ]}
        footer={<CollectedBar expected={expected} received={received} />}
      />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 2fr) minmax(0, 1fr)' },
          alignItems: 'start',
        }}
      >
        <SectionCard
          title={`Receipts${receipts.length ? ` · ${receipts.length}` : ''}`}
          aside={
            <Button size="small" onClick={() => navigate('/credit-notes')} sx={{ color: 'text.secondary' }}>
              All credit notes
            </Button>
          }
        >
          <ReceiptsTable receipts={receipts} navigate={navigate} onAdd={addCreditNote} canAdd={canAdd} />
        </SectionCard>

        <Stack spacing={2}>
          {row.book === 'FC' ? <ForeignContribution row={row} outstanding={outstanding} /> : null}
          <SectionCard title="Tranche">
            <FactRow label="Tranche">
              <Box component="span" sx={{ fontFamily: 'monospace' }}>{row.trancheCode || row.id}</Box>
            </FactRow>
            {row.fundProfileId ? (
              <FactRow label="Funding record">
                <Tooltip title="Open funding record" describeChild>
                  <Link component={RouterLink} to={`/funding/${row.fundProfileId}`} underline="hover" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
                    {row.profileCode || `#${row.fundProfileId}`}
                  </Link>
                </Tooltip>
              </FactRow>
            ) : null}
            <FactRow label="Donor">{row.donor || '—'}</FactRow>
            <FactRow label="Funding source">{FUNDING_SOURCE_TYPE[row.fundingSource] || row.fundingSource}</FactRow>
            <FactRow label="Book">{row.book} · {BOOK[row.book] || ''}</FactRow>
            <FactRow label="Expected date">{formatDate(row.expectedDate)}</FactRow>
            <FactRow label="Expected amount">{formatInrExact(expected)}</FactRow>
          </SectionCard>
        </Stack>
      </Box>
    </Box>
  );
}
