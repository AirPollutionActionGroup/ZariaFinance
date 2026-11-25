import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Grid,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import VolunteerActivismOutlinedIcon from '@mui/icons-material/VolunteerActivismOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import SaveIcon from '@mui/icons-material/Save';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../core/auth/index.js';
import { PageHeader } from '../../../shared/components/index.js';
import { SearchableSelect } from '../../../components/SearchableSelect.jsx';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { usePaymentModes } from '../../payment-mode/hooks/usePaymentModes.js';
import { useBankDetails } from '../../bank-details/hooks/useBankDetails.js';
import { useDonors } from '../../donor-management/hooks/useDonors.js';
import { useDonorFunding, useFundingRecord } from '../../funding-agreements/hooks/useFunding.js';
import { BOOKS, donorBook } from '../../donor-management/lib/donorBook.js';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { useFxRate } from '../../donor-management/hooks/useFxRate.js';
import { formatDate } from '../../../lib/format/date.js';
import { deriveDisbursementType } from '../../donor-management/lib/disbursement.js';
import { useInflowBudgetLines } from '../../inflow-budget/hooks/useInflowBudget.js';
import { computeGrantBalance } from '../../debit-notes/lib/grantBalance.js';
import { useDebitNotes } from '../../debit-notes/hooks/useDebitNotes.js';
import { useCreateCreditNote, useCreditNotes } from '../hooks/useCreditNotes.js';
import { FormSection, MONEY_SX } from '../components/NoteLayout.jsx';
import { BankAccountDetails } from '../components/BankAccountDetails.jsx';
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES } from '../constants.js';

const MAX_MB = ATTACHMENT_MAX_BYTES / (1024 * 1024);
const todayLocal = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

/** Field → label, for the "still needed" summary. */
const FIELD_LABELS = {
  date: 'Date',
  amount: 'Amount',
  book: 'Book',
  paymentModeId: 'Received via',
  fundId: 'Fund profile',
  trancheId: 'Tranche',
  fcAmount: 'Amount in foreign currency',
  fcRate: 'FX rate',
};

/** FxRateResponse.source → label for the reference rate. */
const RATE_SOURCE = { FBIL: 'RBI/FBIL reference rate', ECB: 'ECB reference rate', MANUAL: 'Saved rate', SEED: 'Placeholder rate' };

function initialForm() {
  return {
    date: todayLocal(),
    amount: '',
    book: 'LC',
    paymentModeId: '',
    bankAccountId: '',
    donorId: '',
    fundId: '',
    trancheId: '',
    // FC fund: what arrived in the donor's currency, and the bank's rate ('' = use the reference rate).
    fcAmount: '',
    fcRate: '',
    reference: '',
    tallyVoucherType: '',
    tallyVoucherNo: '',
    remarks: '',
    file: null,
  };
}

/** { value, label } option → the { id, name } snapshot stored on the note. */
const snapshot = (options, value) => {
  const opt = options.find((o) => o.value === value);
  return opt ? { id: opt.value, name: opt.label } : null;
};

/** "₹88.5" — an FX rate as stored (up to 4 decimals). */
const formatRate = (rate) =>
  `₹${Number(rate).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/** One small labelled figure in the fund-context row. */
function ContextFact({ label, children, hint, color }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10.5 }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 700, color }}>
        {children}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ...MONEY_SX }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * What the chosen fund looks like, right under it: its balance (before → after
 * this credit), what is still outstanding on the line, and — for an FC fund —
 * the commitment and agreed rate the receipt is measured against.
 */
function FundContext({ fundBalance, balanceLoading, balanceFailed, outstanding, thisNote, fc, tranche, fcraApplicable }) {
  const money = (v) => (balanceLoading ? '…' : v < 0 ? `−${formatInrExact(-v)}` : formatInrExact(v));
  return (
    <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', bgcolor: 'var(--card2)', overflow: 'hidden' }}>
      <Box
        sx={{
          p: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
        }}
      >
        {fundBalance && !balanceFailed ? (
          <ContextFact
            label="Fund balance"
            hint={thisNote ? `${money(fundBalance.available + thisNote)} after this credit` : 'available now'}
            color={fundBalance.available < 0 ? 'error.main' : undefined}
          >
            {money(fundBalance.available)}
          </ContextFact>
        ) : null}
        {outstanding != null ? (
          <ContextFact
            label={tranche?.trancheCode ? `Outstanding · ${tranche.trancheCode}` : 'Outstanding'}
            hint={outstanding > 0 && thisNote ? `${formatInrExact(Math.max(outstanding - thisNote, 0))} after this receipt` : null}
            color={outstanding > 0 ? 'warning.main' : 'success.main'}
          >
            {outstanding > 0 ? formatInrExact(outstanding) : 'Fully received'}
          </ContextFact>
        ) : null}
        {fc ? (
          <>
            <ContextFact label={`Committed · ${fc.currency}`} hint={`= ${formatInrExact(fc.totalAmount)}`}>
              {formatForeign(fc.currency, fc.foreignAmount)}
            </ContextFact>
            <ContextFact
              label="Agreed rate"
              hint={[fc.fxRateSourceLabel, fc.fxRateDate ? formatDate(fc.fxRateDate) : null].filter(Boolean).join(' · ')}
            >
              {formatRate(fc.fxRate)} per {fc.currency}
            </ContextFact>
          </>
        ) : null}
      </Box>
      {fc || balanceFailed ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{ px: 2, py: 1, alignItems: 'center', borderTop: '1px solid', borderColor: 'divider', flexWrap: 'wrap' }}
        >
          {fc ? (
            <Chip
              size="small"
              variant="outlined"
              color={fcraApplicable ? 'warning' : 'default'}
              label={fcraApplicable ? 'FCRA applicable' : 'FCRA not applicable'}
            />
          ) : null}
          {balanceFailed ? (
            <Typography variant="caption" color="text.secondary">
              Couldn&apos;t load receipts for this fund, so its balance can&apos;t be shown.
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Box>
  );
}

/**
 * Raise a credit note — /credit-notes/new. Records money received back — a
 * refund, a rebate — optionally returned to a donor fund (and, for an FC fund,
 * the amount in its currency and the rate it converted at).
 */
export function CreditNoteCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Debit notes aren't shown here, but the fund's available balance nets them off.
  const debitNotesQuery = useDebitNotes();
  const creditNotesQuery = useCreditNotes();
  const debitNotes = useMemo(() => debitNotesQuery.data || [], [debitNotesQuery.data]);
  const creditNotes = useMemo(() => creditNotesQuery.data || [], [creditNotesQuery.data]);
  const createNote = useCreateCreditNote();

  const [form, setForm] = useState(initialForm);
  const [submitted, setSubmitted] = useState(false);
  // Fields the user has left — their errors show straight away, before submit.
  const [touched, setTouched] = useState({});
  const touch = (field) => () => setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  const [saveError, setSaveError] = useState(null);
  const [fileError, setFileError] = useState(null);

  const setValue = (field, value) => setForm((f) => ({ ...f, [field]: value }));
  const set = (field) => (e) => setValue(field, e.target.value);

  // ── Master data (server-backed) ─────────────────────────────────────────
  const paymentModesQuery = usePaymentModes();
  const paymentModeOptions = useMemo(
    () => (paymentModesQuery.data || []).filter((m) => m.status === 'ACTIVE').map((m) => ({ value: m.id, label: m.name })),
    [paymentModesQuery.data],
  );



  // Money is received into an account booked the same (LC / FC) as the note.
  const bankDetailsQuery = useBankDetails();
  const bankAccountOptions = useMemo(
    () =>
      (bankDetailsQuery.data || [])
        .filter((b) => b.status === 'ACTIVE' && b.book === form.book)
        .map((b) => ({ value: b.id, label: `${b.bankName} — ****${String(b.accountNumber).slice(-4)}` })),
    [bankDetailsQuery.data, form.book],
  );
  // The picked account's full record (IFSC, branch) from the same backend list.
  const selectedBankAccount = (bankDetailsQuery.data || []).find((b) => b.id === form.bankAccountId) || null;

  // ── Fund & Grant ────────────────────────────────────────────────────────
  const donorsQuery = useDonors();
  const donors = useMemo(() => donorsQuery.data || [], [donorsQuery.data]);
  const donorOptions = useMemo(
    () => donors.filter((d) => donorBook(d) === form.book).map((d) => ({ value: d.id, label: d.donorName })),
    [donors, form.book],
  );
  // The donor's funding records; the chosen one's terms and agreement come from GET /funding/{id}.
  const fundProfilesQuery = useDonorFunding(form.donorId || undefined);
  const fundOptions = useMemo(
    () =>
      (fundProfilesQuery.data || [])
        .filter((r) => r.profileId != null)
        .map((r) => ({
          value: r.profileId,
          label: [r.profileCode, r.title || (r.classCode ? `Class ${r.classCode}` : 'Fund profile')].filter(Boolean).join(' · '),
        })),
    [fundProfilesQuery.data],
  );
  const fundRecord = useFundingRecord(form.fundId || undefined);
  const grantQuery = fundRecord.query;
  const assignedGrant = form.fundId ? fundRecord.grant : null;

  // Disbursement type is configured on the fund profile's disbursement rule, not picked here.
  const currentFundProfile = form.fundId ? fundRecord.profile : null;
  const disbursementRule = currentFundProfile?.disbursementRules?.[0] || null;
  const disbursementTypeLabel = currentFundProfile ? deriveDisbursementType(disbursementRule) : '';
  const isTranched = disbursementTypeLabel === 'Tranches';
  const selectedDonor = donors.find((d) => d.id === form.donorId) || null;
  // FC fund: the currency, foreign amount and agreed rate saved on its commitment.
  const fc = disbursementRule?.foreign
    ? {
        currency: disbursementRule.currency,
        foreignAmount: disbursementRule.foreignAmount,
        totalAmount: disbursementRule.totalAmount,
        fxRate: disbursementRule.fxRate,
        fxRateDate: disbursementRule.fxRateDate,
        fxRateSourceLabel: disbursementRule.fxRateSourceLabel,
      }
    : null;
  const tranches = disbursementRule?.trancheCriteria || [];
  // A tranched fund needs the tranche this money goes back to.
  const trancheOptions = isTranched
    ? tranches.map((t, i) => ({
        value: t.id ?? i,
        label: `${t.trancheCode || `Tranche ${i + 1}`}${t.isFinalTranche ? ' (final)' : ''} — ${
          fc && t.foreignAmount != null
            ? `${formatForeign(fc.currency, t.foreignAmount)} (${formatInrExact(t.amountCriteria)})`
            : formatInrExact(t.amountCriteria)
        }`,
      }))
    : [];
  const selectedTranche = isTranched
    ? tranches.find((t, i) => (t.id ?? i) === form.trancheId) || null
    : disbursementTypeLabel === 'Lump Sum'
      ? tranches[0] || null
      : null;

  // FC receipt: amount in the donor's currency × the rate it was converted at.
  // The rate shows the reference rate for the date received until one is typed.
  const fxQuery = useFxRate(fc?.currency, fc ? form.date : null);
  const referenceRate = fxQuery.data?.rateToInr ?? null;
  const usingReferenceRate = form.fcRate === '';
  const fcRateValue = usingReferenceRate ? (referenceRate != null ? String(referenceRate) : '') : form.fcRate;
  const fcAmountNum = Number(form.fcAmount);
  const fcRateNum = Number(fcRateValue);
  const fcInr = fc && fcAmountNum > 0 && fcRateNum > 0 ? Math.round(fcAmountNum * fcRateNum * 100) / 100 : null;
  // INR received vs the same foreign amount at the agreed rate: + gain, − loss.
  const exchangeDiff =
    fc && fcInr != null && Number(fc.fxRate) > 0 ? Math.round((fcInr - fcAmountNum * Number(fc.fxRate)) * 100) / 100 : null;
  const rateHint = !fc
    ? ''
    : usingReferenceRate
      ? fxQuery.isFetching
        ? 'Looking up the reference rate…'
        : referenceRate != null
          ? `${RATE_SOURCE[fxQuery.data.source] || 'Reference rate'}${fxQuery.data.rateDate ? ` · ${formatDate(fxQuery.data.rateDate)}` : ''}`
          : 'No reference rate for this date — enter the bank rate'
      : `Bank rate · ref. ${referenceRate != null ? formatRate(referenceRate) : '—'} · agreed ${formatRate(fc.fxRate)}`;

  // Balance available = received on the fund (Inflow Budget, incl. credit notes) − debit notes.
  const inflowLinesQuery = useInflowBudgetLines();
  const inflowLinesById = useMemo(() => {
    const map = new Map();
    (inflowLinesQuery.data || []).forEach((line) => map.set(Number(line.id), line));
    return map;
  }, [inflowLinesQuery.data]);
  // Still owed from the donor: expected − received on the
  // selected tranche's Inflow Budget line, or across all the fund's criteria for a lump sum.
  const owedOn = (criterionId) => {
    const line = inflowLinesById.get(Number(criterionId));
    return line ? Math.max((Number(line.expectedAmount) || 0) - (Number(line.actualAmount) || 0), 0) : null;
  };
  let outstandingAmount = null;
  if (isTranched && form.trancheId !== '') {
    const tranche = (disbursementRule?.trancheCriteria || []).find((t, i) => (t.id ?? i) === form.trancheId);
    // Fall back to the tranche's committed amount while its Inflow line is loading.
    outstandingAmount = owedOn(form.trancheId) ?? (tranche ? Number(tranche.amountCriteria) || 0 : null);
  } else if (disbursementTypeLabel === 'Lump Sum') {
    const owed = (disbursementRule?.trancheCriteria || []).map((t) => (t.id != null ? owedOn(t.id) : null)).filter((v) => v != null);
    outstandingAmount = owed.length ? owed.reduce((s, v) => s + v, 0) : null;
  }

  const fundBalance = currentFundProfile
    ? computeGrantBalance({
        fundProfile: currentFundProfile,
        grant: assignedGrant,
        inflowLinesById,
        notes: debitNotes,
        credits: creditNotes,
      })
    : null;

  // ── Figures & validation ────────────────────────────────────────────────
  const amount = fc ? fcInr ?? 0 : Number(form.amount);
  const thisNote = amount > 0 ? amount : 0;
  const exceedsOutstanding = outstandingAmount != null && thisNote > outstandingAmount;
  const fullOutstanding = outstandingAmount != null && thisNote > 0 && thisNote === outstandingAmount;
  const outstandingText =
    outstandingAmount == null
      ? ''
      : fullOutstanding
        ? `Full amount received for this ${isTranched ? 'tranche' : 'lump sum'}.`
        : `Outstanding amount: ${formatInr(outstandingAmount)}${
            thisNote ? ` → After this receipt: ${formatInr(Math.max(outstandingAmount - thisNote, 0))}` : ''
          }`;

  const errors = {
    date: form.date ? null : 'Required',
    amount: amount > 0 ? null : 'Enter an amount greater than zero',
    book: form.book ? null : 'Required',
    paymentModeId: form.paymentModeId ? null : 'Select how it was received',
    // A fund profile belongs to a donor — can't pick one without the other.
    fundId: !form.donorId || form.fundId ? null : 'Select the fund profile for this donor',
    trancheId: !isTranched || form.trancheId !== '' ? null : 'Select the tranche',
    fcAmount: !fc || fcAmountNum > 0 ? null : `Enter the amount received in ${fc?.currency}`,
    fcRate: !fc || fcRateNum > 0 ? null : 'Enter the FX rate',
  };
  const isValid = Object.values(errors).every((e) => !e);
  const show = (field) => (submitted || touched[field] ? errors[field] : null);
  const missing = Object.keys(errors).filter((k) => errors[k]).map((k) => FIELD_LABELS[k]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const noFc = { fcAmount: '', fcRate: '' };
  const handleBookChange = (opt) =>
    setForm((f) => ({ ...f, book: opt?.value || '', bankAccountId: '', donorId: '', fundId: '', trancheId: '', ...noFc }));
  const handleDonorChange = (opt) => setForm((f) => ({ ...f, donorId: opt?.value || '', fundId: '', trancheId: '', ...noFc }));
  const handleFundChange = (opt) => setForm((f) => ({ ...f, fundId: opt?.value || '', trancheId: '', ...noFc }));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    e.target.value = ''; // allow re-picking the same file after removing it
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setFileError(`File is larger than ${MAX_MB} MB`);
      return;
    }
    setFileError(null);
    setValue('file', file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitted(true);
    setSaveError(null);
    if (!isValid) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    try {
      const note = await createNote.mutateAsync({
        actor: user?.name || 'You',
        input: {
          date: form.date,
          amount,
          book: form.book,
          paymentMode: snapshot(paymentModeOptions, form.paymentModeId),
          bankAccount: snapshot(bankAccountOptions, form.bankAccountId),
          donor: snapshot(donorOptions, form.donorId),
          fundProfile: snapshot(fundOptions, form.fundId),
          grant: assignedGrant ? { id: assignedGrant.id, name: assignedGrant.grantCode } : null,
          disbursementType: disbursementTypeLabel || null,
          tranche: isTranched ? snapshot(trancheOptions, form.trancheId) : null,
          ...(fc ? { currency: fc.currency, foreignAmount: fcAmountNum, fxRate: fcRateNum } : {}),
          reference: form.reference,
          tallyVoucherType: form.tallyVoucherType,
          tallyVoucherNo: form.tallyVoucherNo,
          remarks: form.remarks,
          // Only the file name is saved for now — there's no file upload service yet.
          attachment: form.file ? { name: form.file.name } : null,
        },
      });
      navigate(`/credit-notes/${note.id}`, { state: { justIssued: true } });
    } catch (err) {
      // A field the server rejected (e.g. a Tally voucher already used) says more than "Validation failed".
      const fieldMessage = err.fieldErrors ? Object.values(err.fieldErrors).find(Boolean) : null;
      setSaveError(fieldMessage || err.message || 'Could not issue the credit note.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const backTo = '/credit-notes';
  const mastersFailed = paymentModesQuery.isError || bankDetailsQuery.isError || donorsQuery.isError;

  return (
    <Box>
      <PageHeader
        title="New Credit Note"
        subtitle="Record money received back — a refund, a reversed overcharge, a rebate — and the donor fund it returns to."
        actions={
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)}>
            Back to List
          </Button>
        }
      />

      {mastersFailed ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Could not load donors, payment modes or bank accounts from the server. Check the connection and reload this page.
        </Alert>
      ) : null}
      {submitted && !isValid ? (
        <Alert severity="error" sx={{ mb: 2, maxWidth: 1040 }}>
          Still needed: {missing.join(', ')}.
        </Alert>
      ) : null}
      {saveError ? <Alert severity="error" sx={{ mb: 2, maxWidth: 1040 }}>{saveError}</Alert> : null}

      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ maxWidth: 1040 }}>
        <Box sx={{ minWidth: 0 }}>
          {/* 01 · Source */}
          <FormSection
            number="01"
            icon={VolunteerActivismOutlinedIcon}
            title="Source"
            description="Which book it's recorded in, when it came in, and the donor fund it goes back to."
          >
            <Grid size={{ xs: 12, sm: 6 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                Book *
              </Typography>
              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                color="success"
                value={form.book}
                onChange={(_, value) => value && handleBookChange({ value })}
                aria-label="Book"
              >
                {BOOKS.map((b) => (
                  <ToggleButton key={b.value} value={b.value} sx={{ py: 1, fontWeight: 600, textTransform: 'none' }}>
                    {b.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                required
                type="date"
                label="Date received"
                value={form.date}
                onChange={set('date')}
                error={Boolean(show('date'))}
                helperText={show('date') || ' '}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <SearchableSelect
                label="Donor"
                options={donorOptions}
                value={donorOptions.find((o) => o.value === form.donorId) || null}
                onChange={handleDonorChange}
                loading={donorsQuery.isLoading}
                disabled={!donorsQuery.isLoading && donorOptions.length === 0}
                placeholder={!donorsQuery.isLoading && donorOptions.length === 0 ? `No ${form.book} donors` : 'Optional'}
                error={show('donorId')}
                helperText={
                  selectedDonor
                    ? [
                        selectedDonor.donorCode,
                        donorBook(selectedDonor) === 'FC'
                          ? selectedDonor.fcraApplicable
                            ? 'FCRA applicable'
                            : 'FCRA not applicable'
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Leave empty if the money isn’t a donor’s'
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <SearchableSelect
                label={form.donorId ? 'Fund profile *' : 'Fund profile'}
                options={fundOptions}
                value={fundOptions.find((o) => o.value === form.fundId) || null}
                onChange={handleFundChange}
                loading={Boolean(form.donorId) && fundProfilesQuery.isLoading}
                disabled={!form.donorId || (!fundProfilesQuery.isLoading && fundOptions.length === 0)}
                placeholder={
                  !form.donorId ? 'Select donor first' : !fundProfilesQuery.isLoading && fundOptions.length === 0 ? 'No fund profiles for this donor' : undefined
                }
                error={show('fundId')}
                helperText={
                  currentFundProfile
                    ? [
                        disbursementTypeLabel,
                        isTranched
                          ? `${tranches.length} ${tranches.length === 1 ? 'tranche' : 'tranches'}`
                          : selectedTranche?.expectedReleaseDate
                            ? `due ${formatDate(selectedTranche.expectedReleaseDate)}`
                            : null,
                        fc ? `${formatForeign(fc.currency, fc.foreignAmount)} committed` : formatInrExact(disbursementRule?.totalAmount),
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : undefined
                }
              />
            </Grid>
            {isTranched ? (
              <Grid size={{ xs: 12 }}>
                <SearchableSelect
                  label="Tranche *"
                  options={trancheOptions}
                  value={trancheOptions.find((o) => o.value === form.trancheId) || null}
                  onChange={(opt) => setValue('trancheId', opt ? opt.value : '')}
                  disabled={trancheOptions.length === 0}
                  placeholder={trancheOptions.length === 0 ? 'No tranches configured' : 'Which tranche this money is for'}
                  error={show('trancheId')}
                  helperText={
                    selectedTranche?.expectedReleaseDate ? `Due ${formatDate(selectedTranche.expectedReleaseDate)}` : undefined
                  }
                />
              </Grid>
            ) : null}
            {currentFundProfile ? (
              <Grid size={12}>
                <FundContext
                  fundBalance={fundBalance}
                  balanceLoading={inflowLinesQuery.isLoading || grantQuery.isLoading}
                  balanceFailed={inflowLinesQuery.isError}
                  outstanding={outstandingAmount}
                  thisNote={thisNote}
                  fc={fc}
                  tranche={selectedTranche}
                  fcraApplicable={Boolean(selectedDonor?.fcraApplicable)}
                />
              </Grid>
            ) : null}
            {!fc && currentFundProfile && form.book === 'FC' ? (
              <Grid size={12}>
                <Alert severity="info">
                  This FC fund was saved before its currency, foreign amount and FX rate were recorded — amounts are INR only.
                </Alert>
              </Grid>
            ) : null}
          </FormSection>

          {/* 02 · Amount */}
          <FormSection
            number="02"
            icon={fc ? CurrencyExchangeIcon : AccountBalanceWalletOutlinedIcon}
            title="Amount"
            description={
              fc
                ? `What the bank credited in ${fc.currency}, and the rate it converted at. The INR amount is worked out for you.`
                : 'How much came in.'
            }
          >
            {fc ? (
              <>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    required
                    type="number"
                    label={`Amount in ${fc.currency}`}
                    value={form.fcAmount}
                    onChange={set('fcAmount')}
                    onBlur={touch('fcAmount')}
                    error={Boolean(show('fcAmount'))}
                    helperText={show('fcAmount') || 'As credited by the bank'}
                    slotProps={{
                      htmlInput: { min: 0, step: 'any' },
                      input: { startAdornment: <InputAdornment position="start">{fc.currency}</InputAdornment>, sx: MONEY_SX },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    required
                    type="number"
                    label={`FX rate (₹ per ${fc.currency})`}
                    value={fcRateValue}
                    onChange={set('fcRate')}
                    onBlur={touch('fcRate')}
                    error={Boolean(show('fcRate'))}
                    helperText={show('fcRate') || rateHint}
                    slotProps={{
                      htmlInput: { min: 0, step: '0.0001' },
                      input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, sx: MONEY_SX },
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  {/* Worked out, not typed: shown as a result, not a disabled input. */}
                  <Box
                    aria-label="Amount (INR)"
                    sx={{
                      height: 56,
                      px: 1.75,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 1,
                      bgcolor: fcInr != null ? 'var(--ok-bg)' : 'var(--card2)',
                      border: '1px solid',
                      borderColor: show('amount') || exceedsOutstanding ? 'error.main' : 'divider',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      Amount (INR)
                    </Typography>
                    <Typography sx={{ ...MONEY_SX, fontWeight: 700, fontSize: 18, color: fcInr != null ? 'success.main' : 'text.disabled' }}>
                      {fcInr != null ? formatInrExact(fcInr) : '₹ —'}
                    </Typography>
                  </Box>
                  <Typography
                    variant="caption"
                    sx={{ display: 'block', mt: 0.5, mx: 1.75, ...MONEY_SX, color: exceedsOutstanding ? 'error.main' : fullOutstanding ? 'success.main' : 'text.secondary' }}
                  >
                    {show('amount') ||
                      (exceedsOutstanding
                        ? `More than the ${formatInrExact(outstandingAmount)} outstanding`
                        : fcInr != null
                          ? `= ${formatForeign(fc.currency, fcAmountNum)} × ${formatRate(fcRateNum)}`
                          : 'Amount × rate')}
                  </Typography>
                </Grid>
                {exchangeDiff != null ? (
                  <Grid size={12}>
                    <Typography
                      variant="body2"
                      sx={{ ...MONEY_SX, color: Math.abs(exchangeDiff) < 0.01 ? 'text.secondary' : exchangeDiff > 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
                    >
                      {Math.abs(exchangeDiff) < 0.01
                        ? `Converted at the agreed rate of ${formatRate(fc.fxRate)}.`
                        : `Exchange ${exchangeDiff > 0 ? 'gain' : 'loss'} of ${formatInrExact(Math.abs(exchangeDiff))} against the agreed rate of ${formatRate(fc.fxRate)}.`}
                    </Typography>
                  </Grid>
                ) : null}
              </>
            ) : (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  required
                  type="number"
                  label="Amount"
                  value={form.amount}
                  onChange={set('amount')}
                  onBlur={touch('amount')}
                  error={Boolean(show('amount')) || exceedsOutstanding}
                  helperText={show('amount') || outstandingText || ' '}
                  slotProps={{
                    htmlInput: { min: 0, step: 'any' },
                    input: { startAdornment: <InputAdornment position="start">₹</InputAdornment>, sx: MONEY_SX },
                    formHelperText: { sx: { ...MONEY_SX, color: !show('amount') && fullOutstanding ? 'success.main' : undefined } },
                  }}
                />
              </Grid>
            )}
          </FormSection>

          {/* 03 · Receipt */}
          <FormSection number="03" icon={PaymentsOutlinedIcon} title="Receipt" description="How it was received and which account it landed in.">
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SearchableSelect
                label="Received via *"
                options={paymentModeOptions}
                value={paymentModeOptions.find((o) => o.value === form.paymentModeId) || null}
                onChange={(opt) => setValue('paymentModeId', opt?.value || '')}
                loading={paymentModesQuery.isLoading}
                error={show('paymentModeId')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <SearchableSelect
                label="Into bank account"
                options={bankAccountOptions}
                value={bankAccountOptions.find((o) => o.value === form.bankAccountId) || null}
                onChange={(opt) => setValue('bankAccountId', opt?.value || '')}
                loading={bankDetailsQuery.isLoading}
                disabled={!bankDetailsQuery.isLoading && bankAccountOptions.length === 0}
                placeholder={!bankDetailsQuery.isLoading && bankAccountOptions.length === 0 ? `No active ${form.book} accounts` : undefined}
              />
              {selectedBankAccount ? (
                <Box sx={{ mt: -1 }}>
                  <BankAccountDetails record={selectedBankAccount} compact />
                </Box>
              ) : bankDetailsQuery.isSuccess && bankAccountOptions.length === 0 ? (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -1 }}>
                  {(bankDetailsQuery.data || []).length
                    ? `No active ${form.book} accounts — change the Book, or add one in Bank Details.`
                    : 'No bank accounts yet — add them in Bank Details.'}
                </Typography>
              ) : null}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label="Reference no."
                placeholder="UTR / SWIFT / credit memo no."
                value={form.reference}
                onChange={set('reference')}
                helperText=" "
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                label="Tally voucher type"
                placeholder="e.g. Receipt"
                value={form.tallyVoucherType}
                onChange={set('tallyVoucherType')}
                helperText="Optional — if this receipt is already in Tally"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                fullWidth
                label="Tally voucher no."
                placeholder="e.g. 245"
                value={form.tallyVoucherNo}
                onChange={set('tallyVoucherNo')}
                error={Boolean(form.tallyVoucherType.trim() && !form.tallyVoucherNo.trim())}
                helperText={
                  form.tallyVoucherType.trim() && !form.tallyVoucherNo.trim()
                    ? 'Enter the voucher number too'
                    : 'Each Tally voucher can be on one credit note'
                }
              />
            </Grid>
          </FormSection>

          {/* 04 · Notes */}
          <FormSection
            number="04"
            icon={DescriptionOutlinedIcon}
            title="Notes & attachment"
            description={`Optional remarks and the credit memo (PDF, JPG or PNG, up to ${MAX_MB} MB).`}
          >
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField fullWidth multiline minRows={2} maxRows={5} label="Remarks" value={form.remarks} onChange={set('remarks')} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              {form.file ? (
                <Chip
                  variant="outlined"
                  color="success"
                  icon={<CheckCircleIcon />}
                  label={`${form.file.name} · ${Math.max(1, Math.round(form.file.size / 1024))} KB`}
                  onDelete={() => setValue('file', null)}
                  sx={{ fontWeight: 600, height: 'auto', minHeight: 80, width: '100%', justifyContent: 'flex-start', '& .MuiChip-label': { whiteSpace: 'normal' } }}
                />
              ) : (
                <Box
                  component="label"
                  sx={{
                    minHeight: 80,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 0.5,
                    borderRadius: 2,
                    border: '1px dashed',
                    borderColor: 'divider',
                    color: 'text.secondary',
                    cursor: 'pointer',
                    '&:hover': { borderColor: 'success.main', color: 'success.main', bgcolor: 'var(--ok-bg)' },
                  }}
                >
                  <UploadFileIcon />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Attach credit memo
                  </Typography>
                  <input type="file" hidden accept={ATTACHMENT_ACCEPT} onChange={handleFileChange} />
                </Box>
              )}
              {fileError ? <Typography variant="caption" color="error">{fileError}</Typography> : null}
            </Grid>
          </FormSection>
        </Box>

        {/* Total + actions, kept in view at the bottom of the screen */}
        <Card
          variant="outlined"
          sx={{
            position: 'sticky',
            bottom: 16,
            zIndex: 2,
            mt: 1,
            px: { xs: 2, md: 2.5 },
            py: 1.5,
            borderRadius: 3,
            display: 'flex',
            gap: 2,
            alignItems: 'center',
            flexWrap: 'wrap',
            boxShadow: 'var(--shadow)',
          }}
        >
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10.5 }}>
              Credit note total · {form.book}
            </Typography>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Typography sx={{ ...MONEY_SX, fontSize: 22, fontWeight: 700, color: thisNote ? 'success.main' : 'text.disabled' }}>
                {formatInrExact(thisNote || 0)}
              </Typography>
              {fc && fcInr != null ? (
                <Typography variant="body2" color="text.secondary" sx={MONEY_SX}>
                  {formatForeign(fc.currency, fcAmountNum)} × {formatRate(fcRateNum)}
                </Typography>
              ) : null}
            </Stack>
          </Box>
          <Button variant="outlined" size="large" onClick={() => navigate(backTo)} sx={{ px: 3, fontWeight: 700 }}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="success"
            size="large"
            startIcon={<SaveIcon />}
            disabled={createNote.isPending}
            sx={{ px: 4, fontWeight: 700, borderRadius: 2 }}
          >
            {createNote.isPending ? 'Issuing…' : 'Issue Credit Note'}
          </Button>
        </Card>
      </Box>
    </Box>
  );
}
