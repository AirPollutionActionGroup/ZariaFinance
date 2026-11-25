import {
  Box,
  Button,
  Card,
  CardContent,
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
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState, LoadingState, RecordHeader, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { BOOK } from '../../../shared/constants/book.js';
import { BUDGET_TYPE } from '../../budget/constants.js';
import { BUDGET_TYPE_ICON } from '../../budget/components/budgetTypeIcons.js';
import { useOutflowRow } from '../hooks/useOutflow.js';
import { useDebitNotes } from '../../debit-notes/hooks/useDebitNotes.js';
import { PAYMENT_STATUS, PAYMENT_STATUS_TONE } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };
const DAY = 24 * 60 * 60 * 1000;
const SMALL_CAPS = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };
const STATUS_COLOR = { OVERDUE: 'error.main', PENDING: 'warning.main', PAID: 'success.main' };

/** Whole days since `date` (0 if it hasn't passed). */
const daysPast = (date) => (date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / DAY)) : 0);

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

/** Label / value row of the facts card. */
function FactRow({ label, children }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2} sx={{ py: 1, borderBottom: '1px solid var(--line2)', '&:last-of-type': { borderBottom: 'none' } }}>
      <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{label}</Typography>
      <Typography variant="body2" component="div" sx={{ fontWeight: 600, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Stack>
  );
}

/** Spend meter under the KPI strip: how much of the budgeted amount is used, with a budget marker when overspent. */
function UsageBar({ budget, spent }) {
  const over = spent > budget;
  const scale = Math.max(budget, spent, 1);
  const pctOf = (v) => `${Math.min(100, Math.max(0, (v / scale) * 100))}%`;
  const used = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  return (
    <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid', borderColor: 'divider', bgcolor: over ? 'var(--err-bg)' : 'transparent' }}>
      <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography variant="caption" sx={{ fontWeight: 700 }}>{over ? 'Over budget' : 'Used'}</Typography>
        <Typography variant="caption" sx={{ ...MONEY_SX, fontWeight: 700, color: over ? 'error.main' : 'text.primary' }}>
          {used}% of budget
        </Typography>
      </Stack>
      <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
        <Box sx={{ height: '100%', width: pctOf(spent), bgcolor: over ? 'var(--err)' : 'var(--ink)', borderRadius: 4, transition: 'width .3s ease' }} />
        {over ? <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: pctOf(budget), width: 2, bgcolor: 'background.paper' }} /> : null}
      </Box>
    </Box>
  );
}

/** The debit notes raised against this row. */
function DebitNotesTable({ notes, navigate, onAdd }) {
  if (!notes.length) {
    return (
      <Stack alignItems="center" spacing={1} sx={{ py: 4, px: 2, textAlign: 'center', border: '1px dashed', borderColor: 'divider', borderRadius: 2 }}>
        <ReceiptLongOutlinedIcon sx={{ color: 'text.disabled', fontSize: 32 }} />
        <Typography variant="body1" sx={{ fontWeight: 600 }}>Nothing spent yet</Typography>
        <Typography variant="body2" color="text.secondary">
          Raise a debit note when money goes out against this line — it adds to Spent here.
        </Typography>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={onAdd} sx={{ mt: 1 }}>
          Add debit note
        </Button>
      </Stack>
    );
  }

  const total = notes.reduce((sum, n) => sum + (Number(n.amount) || 0), 0);
  return (
    <TableContainer sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Table size="small" sx={{ '& th': { ...SMALL_CAPS, whiteSpace: 'nowrap', bgcolor: 'var(--thead)' } }}>
        <TableHead>
          <TableRow>
            <TableCell>Debit note</TableCell>
            <TableCell>Paid to</TableCell>
            <TableCell>Payment</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {notes.map((n) => (
            <TableRow key={n.id} hover onClick={() => navigate(`/debit-notes/${n.id}`)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{n.id}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDate(n.date)}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{n.payee?.name || '—'}</Typography>
                {n.remarks ? <Typography variant="caption" color="text.secondary">{n.remarks}</Typography> : null}
              </TableCell>
              <TableCell>
                <Typography variant="body2" color="text.secondary">
                  {[n.paymentMode?.name, n.reference].filter(Boolean).join(' · ') || '—'}
                </Typography>
                {n.reason ? (
                  <Box sx={{ mt: 0.25 }}>
                    <StatusChip label={`Over budget · ${n.reason}`} tone="warning" />
                  </Box>
                ) : null}
              </TableCell>
              <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700, whiteSpace: 'nowrap' }}>
                {formatInrExact(n.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
            <TableCell colSpan={3} sx={{ fontWeight: 600 }}>
              Total spent · {notes.length} {notes.length === 1 ? 'note' : 'notes'}
            </TableCell>
            <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </TableContainer>
  );
}

/** One outflow row (a budget line's quarter) — /outflow-budget/:id, e.g. BUD-2026-001-BL01-Q2. */
export function OutflowDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const rowQuery = useOutflowRow(id);
  const debitNotesQuery = useDebitNotes();
  const row = rowQuery.data;

  const back = (
    <Button startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 1, color: 'text.secondary' }} onClick={() => navigate('/outflow-budget')}>
      Outflow budget
    </Button>
  );

  if (rowQuery.isPending) return <LoadingState label="Loading outflow row…" />;
  if (rowQuery.isError) {
    return (
      <>
        {back}
        <ErrorState error={rowQuery.error} onRetry={rowQuery.refetch} />
      </>
    );
  }

  const lineNotes = (debitNotesQuery.data || [])
    .filter((n) => n.outflowLineId === row.id)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const status = row.status;
  const budget = Number(row.expectedAmount) || 0;
  const spent = Number(row.spent) || 0;
  const over = row.remaining < 0;
  const late = status === 'OVERDUE' || status === 'PENDING' ? daysPast(row.expectedDate) : 0;
  const TypeIcon = BUDGET_TYPE_ICON[row.budgetType] || BUDGET_TYPE_ICON.PROGRAMME;
  const addNote = () => navigate(`/debit-notes/new?line=${row.id}`);

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <RecordHeader
        breadcrumbs={[
          { label: 'Outflow budget', onClick: () => navigate('/outflow-budget') },
          { label: `${row.budgetCode} · ${row.budgetName}`, onClick: () => navigate(`/budgets/${row.budgetId}`) },
          { label: `${row.lineCode} · ${row.quarterLabel}` },
        ]}
        icon={TypeIcon}
        iconHint={`${BUDGET_TYPE[row.budgetType] || ''} budget`}
        eyebrow={`${row.budgetCode} · ${row.lineCode} · ${row.quarterLabel} · FY ${row.financialYear}`}
        title={row.line}
        status={<StatusChip label={PAYMENT_STATUS[status] || status} tone={PAYMENT_STATUS_TONE[status]} />}
        meta={[
          { label: row.scope, strong: true, hint: `${BUDGET_TYPE[row.budgetType] || ''} budget` },
          { icon: PlaceOutlinedIcon, label: row.stateName || 'All states' },
          { icon: LabelOutlinedIcon, label: row.categoryName || '—', hint: 'Category' },
          { icon: AccountBalanceWalletOutlinedIcon, label: `${row.book} · ${BOOK[row.book] || ''}`, hint: 'Book' },
        ]}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <Button variant="outlined" endIcon={<OpenInNewRoundedIcon sx={{ fontSize: 16 }} />} onClick={() => navigate(`/budgets/${row.budgetId}`)}>
              Open budget
            </Button>
            <Button variant="contained" startIcon={<AddIcon />} onClick={addNote}>
              Add debit note
            </Button>
          </Stack>
        }
      />

      <StatStrip
        sx={{ mb: 2 }}
        stats={[
          { label: 'Budgeted', value: formatInrExact(budget), note: `${row.quarterLabel} · due ${formatDate(row.expectedDate)}` },
          {
            label: 'Spent',
            value: spent ? formatInrExact(spent) : '₹0',
            note: lineNotes.length ? `${lineNotes.length} debit ${lineNotes.length === 1 ? 'note' : 'notes'}` : 'no debit notes yet',
          },
          {
            label: over ? 'Over budget' : 'Remaining',
            value: formatInrExact(Math.abs(row.remaining)),
            note: over ? 'spent more than budgeted' : row.remaining === 0 ? 'fully spent' : 'still available on this line',
            color: over ? 'error.main' : 'success.main',
          },
          {
            label: 'Status',
            value: PAYMENT_STATUS[status] || status,
            note: late ? `${late} ${late === 1 ? 'day' : 'days'} past the quarter's end` : status === 'PAID' ? 'debit notes cover the budget' : 'quarter not ended yet',
            color: STATUS_COLOR[status],
          },
        ]}
        footer={<UsageBar budget={budget} spent={spent} />}
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
          title={`Debit notes${lineNotes.length ? ` · ${lineNotes.length}` : ''}`}
          aside={
            <Button size="small" onClick={() => navigate('/debit-notes')} sx={{ color: 'text.secondary' }}>
              All debit notes
            </Button>
          }
        >
          {debitNotesQuery.isPending ? (
            <Typography variant="body2" color="text.secondary">Loading debit notes…</Typography>
          ) : debitNotesQuery.isError ? (
            <ErrorState error={debitNotesQuery.error} onRetry={debitNotesQuery.refetch} />
          ) : (
            <DebitNotesTable notes={lineNotes} navigate={navigate} onAdd={addNote} />
          )}
        </SectionCard>

        <SectionCard title="Budget line">
          <FactRow label="Budget">
            <Tooltip title="Open budget" describeChild>
              <Box
                component="button"
                type="button"
                onClick={() => navigate(`/budgets/${row.budgetId}`)}
                sx={{ font: 'inherit', fontWeight: 600, border: 0, p: 0, bgcolor: 'transparent', color: 'text.primary', cursor: 'pointer', textAlign: 'right', textDecoration: 'underline', textDecorationColor: 'var(--line)', textUnderlineOffset: 3, '&:hover': { textDecorationColor: 'currentColor' } }}
              >
                {row.budgetName}
              </Box>
            </Tooltip>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>{row.budgetCode}</Typography>
          </FactRow>
          <FactRow label="Line">
            {row.line}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>{row.lineCode}</Typography>
          </FactRow>
          <FactRow label="Type">{BUDGET_TYPE[row.budgetType] || '—'}</FactRow>
          <FactRow label="Scope">{row.scope}</FactRow>
          <FactRow label="Category">{row.categoryName || '—'}</FactRow>
          <FactRow label="State">{row.stateName || 'All states'}</FactRow>
          <FactRow label="Book">{row.book} · {BOOK[row.book] || ''}</FactRow>
          <FactRow label="Quarter">{row.quarterLabel} · FY {row.financialYear}</FactRow>
          <FactRow label="Due by">{formatDate(row.expectedDate)}</FactRow>
        </SectionCard>
      </Box>
    </Box>
  );
}
