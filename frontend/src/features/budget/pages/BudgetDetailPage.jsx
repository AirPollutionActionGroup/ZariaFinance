import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TableCell,
  TableFooter,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import UpdateRoundedIcon from '@mui/icons-material/UpdateRounded';
import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import { downloadCsv } from '../../../lib/export/csv.js';
import { downloadXlsx } from '../../../lib/export/xlsx.js';
import { budgetLinesSheetCsv, budgetWorkbook, printBudgetSheet } from '../lib/budgetSheet.js';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../core/auth/index.js';
import { ConfirmDialog, DataTable, ErrorState, LoadingState, RecordHeader, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { formatDate, formatDateTime } from '../../../lib/format/date.js';
import { BOOK, BOOK_TONE } from '../../../shared/constants/book.js';
import { useBudget, useBudgetTransition, useDeleteBudget } from '../hooks/useBudgets.js';
import { budgetTotal, lineTotal, quarterTotals, totalsBy } from '../lib/budgetMath.js';
import { BUDGET_TYPE_ICON } from '../components/budgetTypeIcons.js';
import {
  BUDGET_STATUS,
  BUDGET_STATUS_TONE,
  BUDGET_TYPE,
  QUARTERS,
  budgetTypeOf,
} from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };

/** Confirm-dialog copy per action; the key is also the API action (submit | withdraw | approve | reject), or delete. */
const ACTIONS = {
  submit: { title: 'Submit for approval?', confirm: 'Submit', color: 'primary', description: 'The budget is locked for editing while it awaits approval.' },
  withdraw: { title: 'Withdraw submission?', confirm: 'Withdraw', color: 'inherit', description: 'The budget returns to Draft so it can be edited again.' },
  approve: { title: 'Approve budget?', confirm: 'Approve', color: 'success', description: 'Approved budgets are final and feed the outflow schedule.' },
  reject: { title: 'Return for revision?', confirm: 'Reject', color: 'error', description: 'The owner can revise and resubmit it.', noteRequired: true },
  delete: { title: 'Delete draft budget?', confirm: 'Delete', color: 'error', description: 'This cannot be undone.' },
};

function SectionCard({ title, aside = null, children, sx }) {
  return (
    <Card sx={{ height: '100%', ...sx }}>
      <CardContent sx={{ px: 2.5, py: 2, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" sx={{ mb: 1.75, alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
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

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };
const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Horizontal share bars — label, amount and % of the budget total. */
function BreakdownBars({ rows, total, labelOf, color = 'primary.main' }) {
  return (
    <Stack spacing={1.25}>
      {rows.map((row) => {
        const pct = pctOf(row.amount, total);
        return (
          <Box key={row.key}>
            <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5, gap: 1.5, alignItems: 'baseline' }}>
              <Typography variant="body2" sx={{ minWidth: 0 }}>{labelOf(row.key)}</Typography>
              <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {formatInrExact(row.amount)} <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>{pct}%</Box>
              </Typography>
            </Stack>
            <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: color, borderRadius: 3 }} />
            </Box>
          </Box>
        );
      })}
    </Stack>
  );
}

/** Status colour for the KPI value, matching the status chips. */
const STATUS_COLOR = { APPROVED: 'success.main', SUBMITTED: 'info.main', REJECTED: 'error.main' };

/** Single budget — /budgets/:id. */
export function BudgetDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const budgetQuery = useBudget(id);
  const budget = budgetQuery.data;
  const transition = useBudgetTransition();
  const removeBudget = useDeleteBudget();
  const [pendingAction, setPendingAction] = useState(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState(null);
  const [exportAnchor, setExportAnchor] = useState(null);
  const [exportNote, setExportNote] = useState(null);

  const listUrl = budget ? `/budgets?fy=${budget.financialYear}` : '/budgets';
  const back = (
    <Button startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 1, color: 'text.secondary' }} onClick={() => navigate(listUrl)}>
      Budgets
    </Button>
  );

  if (budgetQuery.isPending) return <LoadingState label="Loading budget…" />;
  if (budgetQuery.isError) {
    return (
      <>
        {back}
        <ErrorState error={budgetQuery.error} onRetry={budgetQuery.refetch} />
      </>
    );
  }

  const total = budgetTotal(budget.lines);
  const qTotals = quarterTotals(budget.lines);
  const maxQuarter = Math.max(1, ...Object.values(qTotals));
  const books = totalsBy(budget.lines, 'book');
  const action = pendingAction ? ACTIONS[pendingAction] : null;
  const isEditable = budget.status === 'DRAFT' || budget.status === 'REJECTED';
  const busy = transition.isPending || removeBudget.isPending;
  const type = budgetTypeOf(budget);
  const TypeIcon = BUDGET_TYPE_ICON[type];
  const lastEvent = budget.history.at(-1);
  const byWhen = lastEvent ? ` on ${formatDate(lastEvent.at)}${lastEvent.by ? ` by ${lastEvent.by}` : ''}` : '';
  const workflowNote = {
    DRAFT: 'Draft — edit it until it is ready, then submit it for approval.',
    SUBMITTED: `Submitted for approval${byWhen} — approve it, or return it for revision.`,
    APPROVED: `Approved${byWhen} — it now feeds the outflow schedule.`,
    REJECTED: `Returned for revision${byWhen} — revise it and submit again.`,
  }[budget.status];
  const peakQuarter = QUARTERS.reduce((best, q) => (qTotals[q.key] > qTotals[best.key] ? q : best), QUARTERS[0]);
  const bookAmount = (code) => books.find((b) => b.key === code)?.amount || 0;
  // Lines carry their category name from the server; used for the "By category" labels too.
  const categoryName = (categoryId) =>
    budget.lines.find((l) => String(l.category) === String(categoryId))?.categoryName || `Category #${categoryId}`;

  const openAction = (key) => {
    setNote('');
    setActionError(null);
    setPendingAction(key);
  };

  const confirmAction = async () => {
    setActionError(null);
    try {
      if (pendingAction === 'delete') {
        await removeBudget.mutateAsync(budget.id);
        navigate(listUrl);
        return;
      }
      await transition.mutateAsync({ id: budget.id, action: pendingAction, note: note.trim(), actor: user?.name || 'You' });
      setPendingAction(null);
    } catch (err) {
      setActionError(err.message || 'Could not update the budget.');
    }
  };

  // Export: a printable sheet (PDF) for sign-off, an Excel workbook to work in, or the lines as CSV.
  const fileBase = `${budget.budgetCode}-${new Date().toLocaleDateString('en-CA')}`;
  const exportAs = (kind) => {
    setExportAnchor(null);
    setExportNote(null);
    if (kind === 'pdf') {
      if (!printBudgetSheet(budget, { printedBy: user?.name })) {
        setExportNote('Your browser blocked the new window — allow pop-ups for this site and try again.');
      }
    } else if (kind === 'xlsx') {
      downloadXlsx(`${fileBase}.xlsx`, budgetWorkbook(budget));
    } else {
      downloadCsv(`${fileBase}-lines.csv`, budgetLinesSheetCsv(budget));
    }
  };

  const columns = [
    {
      key: 'lineCode',
      header: 'Line',
      render: (l) => <Box sx={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>{l.lineCode}</Box>,
    },
    {
      key: 'description',
      header: 'Description',
      render: (l) => (
        <Box sx={{ minWidth: 160 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{l.description}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>{categoryName(l.category)}</Typography>
        </Box>
      ),
    },
    { key: 'book', header: 'Book', render: (l) => <StatusChip label={l.book} tone={BOOK_TONE[l.book]} /> },
    ...QUARTERS.map((q) => ({
      key: q.key,
      header: q.label,
      align: 'right',
      render: (l) => <Box sx={{ ...MONEY_SX, color: l[q.key] ? 'text.primary' : 'text.disabled' }}>{l[q.key] ? formatInrExact(l[q.key]) : '—'}</Box>,
    })),
    { key: 'total', header: 'Total', align: 'right', render: (l) => <Box sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(lineTotal(l))}</Box> },
    {
      key: 'share',
      header: 'Share',
      align: 'right',
      render: (l) => {
        const share = pctOf(lineTotal(l), total);
        return (
          <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="flex-end">
            <Box sx={{ width: 44, height: 4, borderRadius: 2, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${share}%`, bgcolor: 'text.secondary' }} />
            </Box>
            <Typography variant="caption" sx={{ ...MONEY_SX, color: 'text.secondary', width: 30, textAlign: 'right' }}>{share}%</Typography>
          </Stack>
        );
      },
    },
  ];

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <RecordHeader
        breadcrumbs={[
          { label: 'Budgets', onClick: () => navigate(listUrl) },
          { label: `FY ${budget.financialYear}`, onClick: () => navigate(listUrl) },
          { label: budget.budgetCode },
        ]}
        icon={TypeIcon}
        iconHint={`${BUDGET_TYPE[type]} budget`}
        eyebrow={`${budget.budgetCode} · FY ${budget.financialYear}`}
        title={budget.name}
        status={<StatusChip label={BUDGET_STATUS[budget.status]} tone={BUDGET_STATUS_TONE[budget.status]} />}
        meta={[
          { label: budget.programme, strong: true, hint: `${BUDGET_TYPE[type]} budget` },
          { icon: PlaceOutlinedIcon, label: budget.stateName || 'All states' },
          { icon: PersonOutlineRoundedIcon, label: budget.owner || 'No owner', hint: 'Owner' },
          { icon: UpdateRoundedIcon, label: `Updated ${formatDate(budget.updatedAt)}` },
        ]}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
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
                <ListItemText primary="Budget sheet (PDF)" secondary="Printable page for sign-off — opens Save as PDF" />
              </MenuItem>
              <MenuItem onClick={() => exportAs('xlsx')}>
                <ListItemIcon><GridOnOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Excel workbook (.xlsx)" secondary="Summary dashboard, lines with Q1–Q4 formulas, approval history" />
              </MenuItem>
              <MenuItem onClick={() => exportAs('csv')}>
                <ListItemIcon><DescriptionOutlinedIcon fontSize="small" /></ListItemIcon>
                <ListItemText primary="Lines (CSV)" secondary="One row per line with quarters, share and a total row" />
              </MenuItem>
            </Menu>
          </Stack>
        }
        // The approval workflow gets its own strip: where the budget stands, and what can be done next.
        footer={
          <>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
              {workflowNote}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
              {budget.status === 'DRAFT' ? (
                <Button variant="outlined" color="error" onClick={() => openAction('delete')}>Delete</Button>
              ) : null}
              {isEditable ? (
                <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => navigate(`/budgets/${budget.id}/edit`)}>
                  {budget.status === 'REJECTED' ? 'Revise' : 'Edit'}
                </Button>
              ) : null}
              {budget.status === 'DRAFT' ? (
                <Button variant="contained" onClick={() => openAction('submit')}>Submit for approval</Button>
              ) : null}
              {budget.status === 'SUBMITTED' ? (
                <>
                  <Button variant="outlined" onClick={() => openAction('withdraw')}>Withdraw</Button>
                  <Button variant="outlined" color="error" onClick={() => openAction('reject')}>Reject</Button>
                  <Button variant="contained" color="success" onClick={() => openAction('approve')}>Approve</Button>
                </>
              ) : null}
              {budget.status === 'APPROVED' ? (
                <Button variant="outlined" onClick={() => navigate('/outflow-budget')}>View outflow</Button>
              ) : null}
            </Stack>
          </>
        }
      />

      {exportNote ? (
        <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setExportNote(null)}>
          {exportNote}
        </Alert>
      ) : null}

      {budget.status === 'REJECTED' ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          Returned for revision{budget.history.at(-1)?.note ? `: ${budget.history.at(-1).note}` : '.'}
        </Alert>
      ) : null}

      {/* Key figures, in the same strip style as the budgets list. */}
      <StatStrip
        sx={{ mb: 2 }}
        stats={[
          {
            label: 'Total budget',
            value: formatInrExact(total),
            note: `${budget.lines.length} ${budget.lines.length === 1 ? 'line' : 'lines'} · FY ${budget.financialYear}`,
          },
          {
            label: 'Status',
            value: BUDGET_STATUS[budget.status],
            note: lastEvent ? `${lastEvent.by || '—'} · ${formatDate(lastEvent.at)}` : null,
            color: STATUS_COLOR[budget.status],
          },
          {
            label: 'Busiest quarter',
            value: peakQuarter && qTotals[peakQuarter.key] > 0 ? `${peakQuarter.label} · ${formatInrExact(qTotals[peakQuarter.key])}` : '—',
            note: peakQuarter ? `${peakQuarter.months} · ${pctOf(qTotals[peakQuarter.key], total)}% of year` : null,
          },
          {
            label: 'Book split',
            value: `LC ${pctOf(bookAmount('LC'), total)}%`,
            note: `FC ${pctOf(bookAmount('FC'), total)}% · ${formatInr(bookAmount('LC'))} / ${formatInr(bookAmount('FC'))}`,
          },
        ]}
      />

      {budget.notes ? (
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="flex-start"
          sx={{ mb: 2, px: 2, py: 1.25, borderRadius: 2, bgcolor: 'var(--card2)', border: '1px solid var(--line)' }}
        >
          <StickyNote2OutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', mt: 0.25 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ ...SMALL_CAPS, fontSize: 10.5 }}>Notes</Typography>
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{budget.notes}</Typography>
          </Box>
        </Stack>
      ) : null}

      <Box
        sx={{
          mb: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 7fr) minmax(0, 5fr)' },
        }}
      >
        <SectionCard title="Quarterly phasing" aside={<Typography variant="caption" color="text.secondary">Apr – Mar</Typography>}>
          {/* Bar height = share of the busiest quarter; amount and % of the year above each bar. */}
          <Stack direction="row" spacing={2} alignItems="flex-end" sx={{ height: 124 }}>
            {QUARTERS.map((q) => {
              const amount = qTotals[q.key];
              const isPeak = amount === maxQuarter && amount > 0;
              return (
                <Stack key={q.key} sx={{ flex: 1, minWidth: 0, height: '100%', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Typography sx={{ ...MONEY_SX, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{formatInrExact(amount)}</Typography>
                  <Typography sx={{ ...MONEY_SX, fontSize: 11, color: 'text.secondary', mb: 0.5 }}>{pctOf(amount, total)}%</Typography>
                  <Tooltip title={`${q.label} · ${q.months} · ${formatInrExact(amount)}`}>
                    <Box
                      sx={{
                        width: '100%',
                        maxWidth: 88,
                        height: `${(amount / maxQuarter) * 72}px`,
                        minHeight: 3,
                        borderRadius: '6px 6px 2px 2px',
                        bgcolor: isPeak ? 'var(--ink)' : 'color-mix(in srgb, var(--ink) 22%, transparent)',
                        transition: 'height .3s ease',
                      }}
                    />
                  </Tooltip>
                </Stack>
              );
            })}
          </Stack>
          <Stack direction="row" spacing={2} sx={{ mt: 1, pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            {QUARTERS.map((q) => (
              <Box key={q.key} sx={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{q.label}</Typography>
                <Typography sx={{ fontSize: 10.5, color: 'text.secondary', whiteSpace: 'nowrap' }}>{q.months}</Typography>
              </Box>
            ))}
          </Stack>
        </SectionCard>

        <SectionCard title="Breakdown">
          <Typography sx={{ ...SMALL_CAPS, mb: 1 }}>By category</Typography>
          <BreakdownBars rows={totalsBy(budget.lines, 'category')} total={total} labelOf={categoryName} />
          <Typography sx={{ ...SMALL_CAPS, mt: 2.5, mb: 1 }}>By book</Typography>
          <BreakdownBars
            rows={books}
            total={total}
            labelOf={(k) => (BOOK[k] ? `${k} · ${BOOK[k]}` : k)}
            color="secondary.main"
          />
        </SectionCard>
      </Box>

      <Box sx={{ mb: 2 }}>
        <DataTable
          dense
          title={`Budget lines · ${budget.lines.length}`}
          columns={columns}
          rows={budget.lines}
          getRowKey={(l) => l.id}
          emptyTitle="No budget lines"
          footer={
            budget.lines.length > 1 ? (
              <TableFooter>
                <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
                  <TableCell colSpan={3} sx={{ fontWeight: 600 }}>Total</TableCell>
                  {QUARTERS.map((q) => (
                    <TableCell key={q.key} align="right" sx={{ ...MONEY_SX, fontWeight: 600 }}>
                      {formatInrExact(qTotals[q.key])}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(total)}</TableCell>
                  <TableCell align="right" sx={{ ...MONEY_SX, color: 'text.secondary', fontSize: 12 }}>100%</TableCell>
                </TableRow>
              </TableFooter>
            ) : null
          }
        />
      </Box>

      <SectionCard title="Approval history" aside={<Typography variant="caption" color="text.secondary">Newest first</Typography>}>
        {/* A vertical timeline: dot per event, coloured by status, with who / when / note. */}
        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {[...budget.history].reverse().map((h, i, all) => {
            const color = { APPROVED: 'var(--ok)', SUBMITTED: 'var(--info)', REJECTED: 'var(--err)' }[h.status] || 'var(--muted)';
            const last = i === all.length - 1;
            return (
              <Box component="li" key={`${h.at}-${i}`} sx={{ display: 'flex', gap: 1.5 }}>
                <Stack alignItems="center" sx={{ width: 14, flexShrink: 0 }}>
                  <Box sx={{ width: 12, height: 12, mt: 0.6, borderRadius: '50%', bgcolor: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }} />
                  {last ? null : <Box sx={{ flex: 1, width: 2, bgcolor: 'var(--line)', my: 0.5 }} />}
                </Stack>
                <Box sx={{ pb: last ? 0 : 2, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{BUDGET_STATUS[h.status]}</Typography>
                    <Typography variant="body2" color="text.secondary">by {h.by || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">· {formatDateTime(h.at)}</Typography>
                  </Stack>
                  {h.note ? (
                    <Typography variant="body2" sx={{ mt: 0.5, px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: 'var(--card2)', display: 'inline-block' }}>
                      {h.note}
                    </Typography>
                  ) : null}
                </Box>
              </Box>
            );
          })}
        </Box>
      </SectionCard>

      <ConfirmDialog
        open={Boolean(action)}
        title={action?.title}
        description={action?.description}
        confirmLabel={action?.confirm}
        confirmColor={action?.color}
        busy={busy}
        onClose={() => setPendingAction(null)}
        onConfirm={() => {
          if (action?.noteRequired && !note.trim()) {
            setActionError('Give a reason so the owner knows what to change.');
            return;
          }
          confirmAction();
        }}
      >
        {action && pendingAction !== 'delete' ? (
          <TextField
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 2 }}
            label={action.noteRequired ? 'Reason *' : 'Comment (optional)'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}
        {actionError ? <Alert severity="error" sx={{ mt: 2 }}>{actionError}</Alert> : null}
      </ConfirmDialog>
    </Box>
  );
}
