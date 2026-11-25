import { useMemo, useState } from 'react';
import { Alert, Box, Button, Card, GlobalStyles, Grid, Link, Stack, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import VolunteerActivismOutlinedIcon from '@mui/icons-material/VolunteerActivismOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import { Link as RouterLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../../core/auth/index.js';
import { ErrorState, LoadingState, PageHeader, StatusChip } from '../../../shared/components/index.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate, formatDateTime } from '../../../lib/format/date.js';
import { BOOK, BOOK_TONE } from '../../../shared/constants/book.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { useFundingRecord } from '../../funding-agreements/hooks/useFunding.js';
import { useInflowBudgetLines } from '../../inflow-budget/hooks/useInflowBudget.js';
import { useDebitNotes } from '../../debit-notes/hooks/useDebitNotes.js';
import { computeGrantBalance } from '../../debit-notes/lib/grantBalance.js';
import { useCreditNote, useCreditNotes } from '../hooks/useCreditNotes.js';
import { Figure, MONEY_SX, Panel, TermRow } from '../components/NoteLayout.jsx';
import { BankAccountDetails } from '../components/BankAccountDetails.jsx';

const signedInr = (v) => (v < 0 ? `−${formatInrExact(-v)}` : formatInrExact(v));
const disbursementTone = (type) => (type === 'Tranches' ? 'info' : 'neutral');
/** "₹93.765" — an FX rate as stored (up to 4 decimals). */
const formatRate = (rate) =>
  `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** On print, hide the app chrome and show only the formatted credit note. */
const PRINT_STYLES = {
  '.cn-print': { display: 'none' },
  '@media print': {
    'body *': { visibility: 'hidden' },
    '.cn-print, .cn-print *': { visibility: 'visible' },
    '.cn-print': { display: 'block', position: 'fixed', top: 0, left: 0, width: '100%', padding: '24px', background: '#fff', color: '#000' },
  },
};

const capsSx = { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10.5, fontWeight: 600, color: 'text.secondary' };

/**
 * Headline: how much came in (and, for FC, in which currency at which rate),
 * when and how — and the fund it went back to, linked.
 */
function HeadlineCard({ note }) {
  const hasFund = Boolean(note.fundProfile);
  return (
    <Card variant="outlined" sx={{ mb: 3, borderRadius: 3, overflow: 'hidden' }}>
      <Stack direction={{ xs: 'column', md: 'row' }}>
        {/* Amount */}
        <Box sx={{ p: { xs: 2.5, sm: 3 }, flex: 1.1, bgcolor: 'var(--ok-bg)', minWidth: 0 }}>
          <Typography sx={capsSx}>Amount received</Typography>
          <Typography sx={{ ...MONEY_SX, fontSize: { xs: 32, sm: 40 }, fontWeight: 800, lineHeight: 1.15, mt: 0.5, color: 'success.main' }}>
            {formatInrExact(note.amount)}
          </Typography>
          {note.currency ? (
            <Typography variant="body1" sx={{ ...MONEY_SX, fontWeight: 600, mt: 0.25 }}>
              {formatForeign(note.currency, note.foreignAmount)}
              <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
                {' '}× {formatRate(note.fxRate)} per {note.currency}
              </Box>
            </Typography>
          ) : null}
          <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {note.book ? (
              <StatusChip label={BOOK[note.book] ? `${note.book} · ${BOOK[note.book]}` : note.book} tone={BOOK_TONE[note.book]} />
            ) : null}
            {note.disbursementType ? <StatusChip label={note.disbursementType} tone={disbursementTone(note.disbursementType)} /> : null}
            <Typography variant="body2" color="text.secondary">
              {formatDate(note.date)}
              {note.paymentMode?.name ? ` · via ${note.paymentMode.name}` : ''}
            </Typography>
          </Stack>
        </Box>

        {/* Returned to */}
        <Box
          sx={{
            p: { xs: 2.5, sm: 3 },
            flex: 1,
            minWidth: 0,
            borderLeft: { md: '1px solid' },
            borderTop: { xs: '1px solid', md: 'none' },
            borderColor: 'divider',
          }}
        >
          <Typography sx={capsSx}>Returned to</Typography>
          {hasFund ? (
            <>
              <Link
                component={RouterLink}
                to={note.fundProfile.id ? `/funding/${note.fundProfile.id}` : '#'}
                underline="hover"
                sx={{ display: 'block', mt: 0.75, fontWeight: 700, fontSize: 18, lineHeight: 1.3, overflowWrap: 'anywhere' }}
              >
                {note.fundProfile.name}
              </Link>
              {note.donor ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {note.donor.name}
                </Typography>
              ) : null}
              {note.tranche ? (
                <Typography variant="body2" sx={{ mt: 1, fontFamily: 'monospace', fontWeight: 600 }}>
                  {trancheCodeOf(note.tranche.name)}
                </Typography>
              ) : null}
            </>
          ) : (
            <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
              Not returned to a donor fund.
            </Typography>
          )}
        </Box>
      </Stack>
    </Card>
  );
}

/** "FP-2026-024-T1 — USD 700 (₹65,635.5)" → "FP-2026-024-T1" (the tranche snapshot stores its label). */
function trancheCodeOf(name) {
  return String(name || '').split(' — ')[0] || '—';
}

/**
 * The foreign-currency side of an FC credit note: what arrived, the bank's
 * rate, and how that compares with the rate agreed on the fund.
 */
function ForeignSide({ note, agreed }) {
  const sameCurrency = agreed && agreed.currency === note.currency && Number(agreed.fxRate) > 0;
  const diff = sameCurrency ? Math.round((Number(note.amount) - Number(note.foreignAmount) * Number(agreed.fxRate)) * 100) / 100 : null;
  return (
    <Box sx={{ mt: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1, bgcolor: 'var(--card2)', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          Foreign contribution · {note.currency}
        </Typography>
      </Box>
      <Box sx={{ p: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' } }}>
        <Figure label={`Received in ${note.currency}`} value={formatForeign(note.currency, note.foreignAmount)} strong />
        <Figure label="Bank rate" value={`${formatRate(note.fxRate)} per ${note.currency}`} />
        {sameCurrency ? (
          <Box sx={{ minWidth: 0 }}>
            <Figure label="Agreed rate" value={`${formatRate(agreed.fxRate)} per ${agreed.currency}`} />
            <Typography variant="caption" color="text.secondary">
              {[agreed.fxRateSourceLabel, agreed.fxRateDate ? formatDate(agreed.fxRateDate) : null].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        ) : (
          <Figure label="Agreed rate" value="—" />
        )}
      </Box>
      {diff != null ? (
        <Box
          sx={{
            px: 2,
            py: 1.25,
            borderTop: '1px solid',
            borderColor: 'divider',
            bgcolor: Math.abs(diff) < 0.01 ? 'transparent' : diff > 0 ? 'var(--ok-bg)' : 'var(--err-bg)',
          }}
        >
          <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 600, color: Math.abs(diff) < 0.01 ? 'text.secondary' : diff > 0 ? 'success.main' : 'error.main' }}>
            {Math.abs(diff) < 0.01
              ? 'Converted at the agreed rate.'
              : `Exchange ${diff > 0 ? 'gain' : 'loss'} of ${formatInrExact(Math.abs(diff))} against the agreed rate`}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );
}

/** Where the fund stands now, with this note's part in it. */
function FundBalance({ balance, loading, note }) {
  if (loading) {
    return <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>Loading fund balance…</Typography>;
  }
  if (!balance) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {note.fundProfile?.id == null
          ? 'Live balance is shown for fund profiles picked from the Donors Registry.'
          : 'Balance not available for this fund profile.'}
      </Typography>
    );
  }
  const share = balance.received > 0 ? Math.min(100, Math.max(0, (balance.available / balance.received) * 100)) : 0;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={capsSx}>Fund balance now</Typography>
      <Box sx={{ mt: 1, display: 'grid', gap: 2, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Figure label="Received" value={formatInrExact(balance.received)} color="success.main" />
        <Figure label="Debited" value={balance.debited ? `− ${formatInrExact(balance.debited)}` : formatInrExact(0)} color={balance.debited ? 'error.main' : undefined} />
        <Figure label="Available" strong value={signedInr(balance.available)} color={balance.available < 0 ? 'error.main' : 'text.primary'} />
      </Box>
      {balance.received > 0 ? (
        <Box sx={{ mt: 1.25, height: 6, borderRadius: 3, bgcolor: 'var(--line2)', overflow: 'hidden' }}>
          <Box sx={{ height: '100%', width: `${share}%`, bgcolor: 'success.main', borderRadius: 3 }} />
        </Box>
      ) : null}
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, ...MONEY_SX }}>
        Received includes {formatInrExact(balance.credited)} via credit notes — {formatInrExact(note.amount)} of it from this one.
      </Typography>
    </Box>
  );
}

/** The issue event as a short timeline. */
function Timeline({ note }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
      <Box sx={{ mt: 0.75, width: 10, height: 10, borderRadius: '50%', bgcolor: 'success.main', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          Issued · {formatInrExact(note.amount)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {note.createdBy || '—'} · {formatDateTime(note.createdAt)}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Plain, printer-friendly credit note document — same order as the form. */
function PrintableNote({ note, organisation }) {
  const cell = { border: '1px solid #999', padding: '6px 10px', fontSize: 12, textAlign: 'left' };
  const row = (label, value) => (
    <tr>
      <th style={cell}>{label}</th>
      <td style={cell}>{value || '—'}</td>
    </tr>
  );
  return (
    <Box className="cn-print" sx={{ fontFamily: 'Arial, sans-serif' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', pb: 1, mb: 2 }}>
        <Box>
          <Box sx={{ fontSize: 18, fontWeight: 700 }}>{organisation || 'Organisation'}</Box>
          <Box sx={{ fontSize: 11 }}>Credit note — money received back</Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Box sx={{ fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>CREDIT NOTE</Box>
          <Box sx={{ fontSize: 12 }}>No. {note.id}</Box>
          <Box sx={{ fontSize: 12 }}>Date {formatDate(note.date)}</Box>
        </Box>
      </Box>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
        <tbody>
          {row('Book', note.book)}
          {row('Donor', note.donor?.name)}
          {row('Fund profile', note.fundProfile?.name)}
          {row('Grant agreement', note.grant?.name)}
          {row('Disbursement type', [note.disbursementType, note.tranche?.name].filter(Boolean).join(' · '))}
          {row('Received via', note.paymentMode?.name)}
          {row('Into bank account', note.bankAccount?.name)}
          {row('Reference no.', note.reference)}
          {note.tallyVoucherNo ? row('Tally voucher', [note.tallyVoucherType, note.tallyVoucherNo].filter(Boolean).join(' ')) : null}
          {note.group || note.ledger ? row('Group / Ledger', [note.group?.name, note.ledger?.name].filter(Boolean).join(' ▸ ')) : null}
          {note.currency
            ? row(`Received in ${note.currency}`, `${formatForeign(note.currency, note.foreignAmount)} at ${formatRate(note.fxRate)} per ${note.currency}`)
            : null}
          {row('Remarks', note.remarks)}
          <tr>
            <th style={{ ...cell, fontSize: 14 }}>Amount</th>
            <td style={{ ...cell, fontSize: 14, fontWeight: 700 }}>{formatInrExact(note.amount)}</td>
          </tr>
        </tbody>
      </table>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 8, fontSize: 12 }}>
        <Box sx={{ borderTop: '1px solid #000', pt: 0.5, width: 200 }}>Prepared by: {note.createdBy || ''}</Box>
        <Box sx={{ borderTop: '1px solid #000', pt: 0.5, width: 200 }}>Approved by</Box>
      </Box>
    </Box>
  );
}

/** Single credit note — /credit-notes/:id. */
export function CreditNoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const noteQuery = useCreditNote(id);
  const note = noteQuery.data || null;
  const debitNotesQuery = useDebitNotes();
  const creditNotesQuery = useCreditNotes();
  const location = useLocation();
  const [justIssued, setJustIssued] = useState(Boolean(location.state?.justIssued));

  // ── Live balance on the fund this note went back to (same maths as the form) ──
  const fundProfileId = note?.fundProfile?.id ?? undefined;
  // The fund's terms and agreement in one call (GET /funding/{id}).
  const fundRecord = useFundingRecord(fundProfileId);
  const fundProfileQuery = { data: fundRecord.profile, isLoading: fundRecord.query.isLoading };
  const grantQuery = { data: fundRecord.grant };
  const inflowLinesQuery = useInflowBudgetLines();
  const inflowLinesById = useMemo(() => {
    const map = new Map();
    (inflowLinesQuery.data || []).forEach((l) => map.set(Number(l.id), l));
    return map;
  }, [inflowLinesQuery.data]);

  const back = (
    <Button startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2, color: 'text.secondary' }} onClick={() => navigate('/credit-notes')}>
      Credit Notes
    </Button>
  );

  if (noteQuery.isPending) return <LoadingState label="Loading credit note…" />;
  if (noteQuery.isError) {
    return (
      <>
        {back}
        <ErrorState error={noteQuery.error} onRetry={noteQuery.refetch} />
      </>
    );
  }

  const fundBalance = fundProfileQuery.data
    ? computeGrantBalance({
        fundProfile: fundProfileQuery.data,
        grant: grantQuery.data || null,
        inflowLinesById,
        notes: debitNotesQuery.data || [],
        credits: creditNotesQuery.data || [],
      })
    : null;
  const balanceLoading = fundProfileId != null && (fundProfileQuery.isLoading || inflowLinesQuery.isLoading);

  // The fund's agreed FX terms, to measure an FC receipt against.
  const agreedRule = (fundProfileQuery.data?.disbursementRules || []).find((r) => r.foreign) || null;

  return (
    <Box sx={{ maxWidth: 1240 }}>
      <GlobalStyles styles={PRINT_STYLES} />
      {back}

      <PageHeader
        eyebrow="Credit note"
        title={note.id}
        subtitle={`Recorded by ${note.createdBy || '—'} on ${formatDate(note.createdAt)}`}
        actions={
          <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
            Print
          </Button>
        }
      />

      {justIssued ? (
        <Alert severity="success" onClose={() => setJustIssued(false)} sx={{ mb: 3 }}>
          {note.id} issued — {formatInrExact(note.amount)}
          {note.fundProfile ? ` returned to ${note.fundProfile.name}` : ' recorded'}.
        </Alert>
      ) : null}

      <HeadlineCard note={note} />

      {/* Each column keeps its own height — no stretched, half-empty cards. */}
      <Grid container spacing={3} sx={{ alignItems: 'flex-start' }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Panel icon={VolunteerActivismOutlinedIcon} title="Fund">
            {note.donor || note.fundProfile ? (
              <>
                <TermRow label="Donor">
                  {note.donor?.id ? (
                    <Link component={RouterLink} to={`/donors/${note.donor.id}`} underline="hover">
                      {note.donor.name}
                    </Link>
                  ) : (
                    note.donor?.name || '—'
                  )}
                </TermRow>
                <TermRow label="Funding record">
                  {note.fundProfile?.id ? (
                    <Link component={RouterLink} to={`/funding/${note.fundProfile.id}`} underline="hover">
                      {note.fundProfile.name}
                    </Link>
                  ) : (
                    note.fundProfile?.name || '—'
                  )}
                </TermRow>
                <TermRow label="Grant agreement">{note.grant?.name || '—'}</TermRow>
                <TermRow label="Tranche" last>
                  {note.tranche ? (
                    <Typography variant="body1" sx={{ fontFamily: 'monospace' }}>
                      {trancheCodeOf(note.tranche.name)}
                    </Typography>
                  ) : note.disbursementType === 'Lump Sum' ? (
                    'Lump sum'
                  ) : (
                    '—'
                  )}
                </TermRow>
                {note.currency ? <ForeignSide note={note} agreed={agreedRule} /> : null}
                <FundBalance balance={fundBalance} loading={balanceLoading} note={note} />
              </>
            ) : (
              <Box sx={{ py: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  This credit wasn&apos;t returned to a donor fund.
                </Typography>
              </Box>
            )}
          </Panel>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Stack spacing={3}>
            <Panel icon={PaymentsOutlinedIcon} title="Receipt">
              <TermRow label="Received via">{note.paymentMode?.name || '—'}</TermRow>
              <Box sx={{ py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography sx={{ ...capsSx, fontWeight: 400, fontSize: 12, mb: 0.75 }}>Into account</Typography>
                <BankAccountDetails id={note.bankAccount?.id} fallbackName={note.bankAccount?.name} />
              </Box>
              <TermRow label="Reference no." last={!(note.group || note.ledger) && !note.tallyVoucherNo}>
                {note.reference || '—'}
              </TermRow>
              {note.tallyVoucherNo ? (
                <TermRow label="Tally voucher" last={!(note.group || note.ledger)}>
                  {[note.tallyVoucherType, note.tallyVoucherNo].filter(Boolean).join(' ')}
                </TermRow>
              ) : null}
              {note.group || note.ledger ? (
                // Older credit notes recorded a group / ledger; new ones no longer ask for it.
                <TermRow label="Group ▸ Ledger" last>
                  {[note.group?.name, note.ledger?.name].filter(Boolean).join(' ▸ ')}
                </TermRow>
              ) : null}
            </Panel>

            <Panel icon={DescriptionOutlinedIcon} title="Notes & attachment">
              <Typography variant="body2" sx={{ mt: 0.5, color: note.remarks ? 'text.primary' : 'text.secondary', whiteSpace: 'pre-wrap' }}>
                {note.remarks || 'No remarks.'}
              </Typography>
              <Box sx={{ mt: 1.5 }}>
                {note.attachment ? (
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<AttachFileIcon />}
                    href={note.attachment.url || undefined}
                    disabled={!note.attachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={note.attachment.name}
                    sx={{ textTransform: 'none' }}
                  >
                    {note.attachment.name}
                  </Button>
                ) : (
                  <Typography variant="caption" color="text.secondary">No attachment.</Typography>
                )}
              </Box>
            </Panel>

            <Panel icon={HistoryOutlinedIcon} title="History">
              <Timeline note={note} />
            </Panel>
          </Stack>
        </Grid>
      </Grid>

      <PrintableNote note={note} organisation={user?.organisationName} />
    </Box>
  );
}
