import { Box, Button, Stack, TableCell, TableFooter, TableRow, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import { useNavigate } from 'react-router-dom';
import { DataTable, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatDate } from '../../../lib/format/date.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { FUND_CLASS_CODE_LABEL, FUND_CLASS_CODE_TONE } from '../../donor-management/constants.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { useFundingRecords } from '../hooks/useFunding.js';
import { STAGE_BY_KEY, codeSortValue } from '../lib/fundingRecords.js';
import { CLASS_NAME } from '../constants.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

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
        ) : (
          <Typography variant="caption" sx={{ color: 'var(--warn)' }}>No agreement yet</Typography>
        )}
      </Box>
    ),
  },
  {
    key: 'title',
    header: 'Agreement',
    sortValue: (row) => row.title,
    render: (row) => (
      <Box sx={{ minWidth: 180, maxWidth: 340 }}>
        <Typography
          variant="body2"
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
        {row.programmeName ? (
          <Typography variant="caption" color="text.secondary">{row.programmeName}</Typography>
        ) : null}
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
            <StatusChip label={`${row.classCode} · ${CLASS_NAME[row.classCode]}`} tone={FUND_CLASS_CODE_TONE[row.classCode]} />
          </span>
        </Tooltip>
      ) : (
        <StatusChip label="Not set" tone="neutral" />
      ),
  },
  {
    key: 'period',
    header: 'Period',
    sortValue: (row) => row.startDate,
    render: (row) =>
      row.startDate ? (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ lineHeight: 1.35 }}>{formatDate(row.startDate)}</Typography>
          <Typography variant="caption" color="text.secondary">to {formatDate(row.endDate)}</Typography>
        </Box>
      ) : (
        <Typography variant="caption" color="text.disabled">Set on agreement</Typography>
      ),
  },
  {
    key: 'committed',
    header: 'Committed',
    align: 'right',
    sortValue: (row) => (row.hasSchedule ? row.committed : null),
    render: (row) =>
      row.hasSchedule ? (
        <Box>
          <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 600 }}>{formatInrExact(row.committed)}</Typography>
          {row.currency && row.foreignAmount != null ? (
            <Typography variant="caption" color="text.secondary" sx={MONEY_SX}>
              {formatForeign(row.currency, row.foreignAmount)}
            </Typography>
          ) : null}
        </Box>
      ) : (
        <Typography variant="caption" color="text.disabled">No schedule yet</Typography>
      ),
  },
  {
    key: 'stage',
    header: 'Stage',
    sortValue: (row) => row.stage,
    render: (row) => <StatusChip label={STAGE_BY_KEY[row.stage].label} tone={STAGE_BY_KEY[row.stage].tone} />,
  },
];

/** Sum of committed ₹ over funding with a payment schedule. */
const committedOf = (list) => list.filter((r) => r.hasSchedule).reduce((s, r) => s + (Number(r.committed) || 0), 0);

/**
 * A donor's funding at a glance, for the top of the donor page: total
 * committed (with foreign-currency totals for FC funding), approved, waiting
 * for approval, and terms not yet signed. Shares its query with DonorFundingList.
 */
export function DonorFundingStats({ donorId }) {
  const { records, isPending } = useFundingRecords({ donorId });
  const rows = records.filter((r) => r.href);
  const by = (stage) => rows.filter((r) => r.stage === stage);
  const approved = by('approved');
  const pending = by('pending');
  const termsOnly = by('terms');
  const foreign = Object.entries(
    rows.reduce((acc, r) => {
      if (r.currency && r.foreignAmount != null) acc[r.currency] = (acc[r.currency] || 0) + Number(r.foreignAmount);
      return acc;
    }, {}),
  ).map(([currency, amount]) => formatForeign(currency, amount));
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const dash = '—';
  // No funding yet: the list below says so — a strip of dashes would only add noise.
  if (isPending || !rows.length) return null;

  return (
    <StatStrip
      sx={{ mb: 2 }}
      stats={[
        {
          label: 'Total committed',
          value: rows.length ? formatInrExact(committedOf(rows)) : dash,
          note: rows.length ? [count(rows.length, 'agreement'), ...foreign].join(' · ') : 'No funding yet',
        },
        {
          label: 'Approved',
          value: approved.length ? formatInrExact(committedOf(approved)) : dash,
          note: approved.length ? `${count(approved.length, 'agreement')} · live funding` : 'none approved yet',
          color: approved.length ? 'success.main' : undefined,
        },
        {
          label: 'Pending approval',
          value: pending.length ? formatInrExact(committedOf(pending)) : dash,
          note: pending.length ? count(pending.length, 'agreement') : 'nothing waiting',
          color: pending.length ? 'warning.main' : undefined,
        },
        {
          label: 'Terms only',
          value: String(termsOnly.length),
          note: termsOnly.length ? 'no agreement signed yet' : 'every term has an agreement',
        },
      ]}
    />
  );
}

/**
 * A donor's funding agreements (terms + signed agreement, one row each) — for
 * the donor page. Rows open the funding record; the total counts only funding
 * with a payment schedule.
 */
export function DonorFundingList({ donorId, canAdd = true }) {
  const navigate = useNavigate();
  const { records, isPending, error, refetch } = useFundingRecords({ donorId });
  const rows = records.filter((r) => r.href);
  const committed = committedOf(rows);
  const addFunding = () => navigate(`/funding/new?donorId=${donorId}`);

  return (
    <DataTable
      dense
      title={rows.length ? `Funding agreements · ${rows.length}` : 'Funding agreements'}
      actions={
        <Stack direction="row" spacing={1.5} alignItems="center">
          {canAdd ? (
            <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={addFunding}>
              Add funding
            </Button>
          ) : null}
        </Stack>
      }
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.key}
      isLoading={isPending}
      error={error}
      onRetry={refetch}
      defaultSort={{ key: 'code', direction: 'desc' }}
      emptyTitle="No funding agreements yet"
      emptyDescription="Use “Add funding” to record this donor's terms and the agreement signed on them."
      onRowClick={(row) => navigate(row.href)}
      footer={
        rows.length > 1 ? (
          <TableFooter>
            <TableRow sx={{ '& td': { borderBottom: 'none', bgcolor: 'var(--card2)', color: 'text.primary', fontSize: 13 } }}>
              <TableCell colSpan={4} sx={{ fontWeight: 600 }}>
                Total · {rows.length} agreements
              </TableCell>
              <TableCell align="right" sx={{ ...MONEY_SX, fontWeight: 700 }}>{formatInrExact(committed)}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        ) : null
      }
    />
  );
}
