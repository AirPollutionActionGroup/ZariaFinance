/**
 * Overview tab of /funding/:id — the record's details (agreement, terms,
 * approval), each tranche with what has been received against it, and the
 * latest changes from the change history.
 */
import { Box, Button, Link, Stack, Typography } from '@mui/material';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Link as RouterLink } from 'react-router-dom';
import { FieldSection, Panel, StatusChip } from '../../../shared/components/index.js';
import { formatDate, formatDateTime } from '../../../lib/format/date.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { instalmentsOf } from './FundingTermsSections.jsx';
import { trancheStatus } from '../lib/trancheStatus.js';

function money(rule) {
  if (!rule?.foreign || !rule.currency) return null;
  const fc = `${rule.currency} ${Number(rule.foreignAmount || 0).toLocaleString('en-IN')}`;
  const rate = rule.fxRate ? ` @ ₹${Number(rule.fxRate)}` : '';
  return `${fc}${rate}`;
}

/** Agreement, terms and approval as label-over-value sections in one card. */
function DetailsPanel({ profile, grant, donor, rule }) {
  const approved = grant?.isApproved === 1;
  const foreign = donor ? donor.fundSourceDomicile === 'FOREIGN' : Boolean(rule?.foreign);
  const programme = profile.programmeName
    ? profile.parentProgrammeName && profile.parentProgrammeName !== profile.programmeName
      ? `${profile.parentProgrammeName} › ${profile.programmeName}`
      : profile.programmeName
    : null;

  return (
    <Panel title="Details">
      <FieldSection
        first
        title="Agreement"
        fields={
          grant
            ? [
                {
                  label: 'Grant code',
                  mono: true,
                  value: grant.legacyCode ? `${grant.grantCode}\nformerly ${grant.legacyCode}` : grant.grantCode,
                },
                { label: 'Signed on', value: grant.agreementDate ? formatDate(grant.agreementDate) : null },
                { label: 'Period', value: `${formatDate(grant.startDate)} → ${formatDate(grant.endDate)}` },
                { label: 'Book', value: foreign ? 'FC · Foreign contribution' : 'LC · Local contribution' },
                { label: 'FCRA', value: donor ? (donor.fcraApplicable ? 'Applicable' : 'Not applicable') : null },
                { label: 'Foreign amount', value: money(rule), hideEmpty: true },
                { label: 'Notes', value: grant.description, wide: true, emptyText: 'No notes' },
              ]
            : [{ label: 'Agreement', value: null, wide: true, emptyText: 'Not recorded yet — dates, approval and the grant code appear here once it is.' }]
        }
      />
      <FieldSection
        title="Terms"
        fields={[
          { label: 'Fund mode', value: profile.fundModeLabel },
          { label: 'Class', value: profile.fundClassLabel },
          { label: 'Programme', value: programme, emptyText: 'Not tied to a programme' },
          { label: 'Reporting', value: profile.reportingFrequencyLabel || profile.reportingFrequency },
          { label: 'Overhead cap', value: profile.overheadLimitPercent != null ? `${Number(profile.overheadLimitPercent)}%` : null, emptyText: 'No cap' },
          { label: 'Onboarding', value: profile.onboardingComplete ? 'Complete' : 'Not complete' },
          { label: 'Purpose', value: profile.purpose, wide: true, emptyText: 'No purpose written' },
        ]}
      />
      {grant ? (
        <FieldSection
          title="Approval"
          fields={[
            { label: 'Status', value: approved ? 'Approved' : 'Pending approval' },
            { label: 'Approved by', value: approved ? grant.approvedByName || grant.approvedBy : null, emptyText: approved ? 'Not recorded' : '—' },
            { label: 'Approved on', value: approved && grant.approvalDate ? formatDateTime(grant.approvalDate) : null },
            // Approve and hold both write their remarks here, so it holds the latest status step's remark.
            { label: 'Status remarks', value: grant.approvalRemarks, wide: true, hideEmpty: true },
          ]}
        />
      ) : null}
    </Panel>
  );
}

/** Each tranche: when, how much, and what has come in against it — opens its Inflow Budget line. */
function TranchesPanel({ rule, receivedByTranche, hasAgreement }) {
  const instalments = rule ? instalmentsOf(rule) : [];
  const expectedTotal = instalments.reduce((s, t) => s + (Number(t.amountCriteria) || 0), 0);
  const gotTotal = instalments.reduce((s, t) => s + (receivedByTranche[String(t.id)]?.amount || 0), 0);

  return (
    <Panel
      title="Tranches"
      aside={
        instalments.length ? (
          <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
            {instalments.filter((t) => (receivedByTranche[String(t.id)]?.amount || 0) >= Number(t.amountCriteria || 0) && Number(t.amountCriteria) > 0).length} of {instalments.length} received
          </Typography>
        ) : null
      }
      bodySx={{ py: 0.5 }}
      footer={
        instalments.length ? (
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <span>
              Received <Box component="strong" sx={{ color: 'text.primary' }}>{formatInrExact(gotTotal)}</Box> of {formatInrExact(expectedTotal)}
            </span>
            <Link component={RouterLink} to="/inflow-budget" underline="hover" sx={{ fontWeight: 600 }}>Inflow Budget</Link>
          </Stack>
        ) : null
      }
    >
      {!instalments.length ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>No payment schedule yet.</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {instalments.map((t, i) => {
            const expected = Number(t.amountCriteria) || 0;
            const got = receivedByTranche[String(t.id)];
            const status = trancheStatus({ expected, received: got?.amount || 0, expectedDate: t.expectedReleaseDate, hasAgreement });
            const row = (
              <>
                <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'var(--card2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatInrExact(expected)}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', lineHeight: 1.4 }}>
                    {t.expectedReleaseDate ? `Due ${formatDate(t.expectedReleaseDate)}` : 'Date not set'}
                    {got?.amount > 0 && got.amount < expected ? ` · ${formatInrExact(got.amount)} received` : ''}
                    {got?.amount >= expected && got?.date ? ` · received ${formatDate(got.date)}` : ''}
                  </Typography>
                </Box>
                <StatusChip label={status.label} tone={status.tone} />
                {t.id != null ? <ChevronRightRoundedIcon sx={{ fontSize: 18, color: 'text.disabled' }} /> : null}
              </>
            );
            const rowSx = { display: 'flex', alignItems: 'center', gap: 1.25, py: 1.1, borderTop: i ? '1px solid var(--line2)' : 'none', color: 'inherit', textDecoration: 'none' };
            return (
              <li key={t.id ?? i}>
                {t.id != null ? (
                  <Box
                    component={RouterLink}
                    to={`/inflow-budget/${t.id}`}
                    aria-label={`Tranche ${i + 1}${t.trancheCode ? ` ${t.trancheCode}` : ''}: ${formatInrExact(expected)}, ${status.label}`}
                    sx={{ ...rowSx, mx: -1, px: 1, borderRadius: 1.5, '&:hover': { bgcolor: 'var(--card2)' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
                  >
                    {row}
                  </Box>
                ) : (
                  <Box sx={rowSx}>{row}</Box>
                )}
              </li>
            );
          })}
        </Box>
      )}
    </Panel>
  );
}

const DOT = { APPROVED: 'var(--ok)', ACTIVATED: 'var(--ok)', RESUMED: 'var(--ok)', ON_HOLD: 'var(--warn)', CLOSED: 'var(--err)', UPDATED: 'var(--ink)' };

/** The latest three entries of the change history, with a way into the full list. */
function RecentChanges({ historyQuery, onShowHistory }) {
  const entries = (historyQuery.data || []).slice(0, 3);
  return (
    <Panel
      title="Recent changes"
      aside={
        historyQuery.data?.length ? (
          <Button size="small" onClick={onShowHistory} sx={{ minWidth: 0, px: 1 }}>
            View all {historyQuery.data.length}
          </Button>
        ) : null
      }
      bodySx={{ py: 1.25 }}
    >
      {historyQuery.isPending ? (
        <Typography variant="body2" color="text.secondary">Loading…</Typography>
      ) : !entries.length ? (
        <Typography variant="body2" color="text.secondary">No changes recorded yet.</Typography>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {entries.map((e, i) => {
            const fields = e.changes.map((c) => c.field);
            const what =
              e.action === 'UPDATED'
                ? `${fields.slice(0, 2).join(', ')}${fields.length > 2 ? ` +${fields.length - 2} more` : ''}`
                : e.changes[0]?.to && e.changes[0].to !== e.actionLabel
                  ? e.changes[0].to
                  : null;
            return (
              <Box component="li" key={e.id} sx={{ display: 'flex', gap: 1.25, py: 0.9, borderTop: i ? '1px solid var(--line2)' : 'none' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', mt: 0.75, flexShrink: 0, bgcolor: DOT[e.action] || 'var(--info)' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }} noWrap>
                    {e.actionLabel}
                    {what ? <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}> · {what}</Box> : null}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {e.changedBy ? `${e.changedBy} · ` : ''}
                    {formatDateTime(e.changedAt)}
                  </Typography>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}
    </Panel>
  );
}

export function FundingOverview({ profile, grant, donor, receivedByTranche, historyQuery, onShowHistory }) {
  const rule = profile.disbursementRules?.[0];
  return (
    <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 360px' } }}>
      <DetailsPanel profile={profile} grant={grant} donor={donor} rule={rule} />
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <TranchesPanel rule={rule} receivedByTranche={receivedByTranche} hasAgreement={Boolean(grant)} />
        <RecentChanges historyQuery={historyQuery} onShowHistory={onShowHistory} />
      </Stack>
    </Box>
  );
}
