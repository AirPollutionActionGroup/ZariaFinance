import { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, FormControlLabel, Grid, Stack, Switch, TextField, Typography } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Breadcrumbs,
  ErrorState,
  LoadingState,
  PageHeader,
  RhfAutocomplete,
  RhfTextField,
  StatusChip,
} from '../../../shared/components/index.js';
import { queryKeys } from '../../../lib/query/queryKeys.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { useDonors } from '../../donor-management/hooks/useDonors.js';
import { toGrantFormValues } from '../../donor-management/mappers/grantMapper.js';
import { toFundProfileFormValues } from '../../donor-management/mappers/fundProfileMapper.js';
import { fundingService } from '../services/fundingService.js';
import { toFormErrors } from '../mappers/fundingMapper.js';
import { DISBURSEMENT_ERROR_FIELDS, FundProfileFields } from '../../donor-management/components/FundProfileFields.jsx';
import { useFundingHistory, useFundingRecord } from '../hooks/useFunding.js';
import { useAuth } from '../../../core/auth/index.js';
import { formatDateTime } from '../../../lib/format/date.js';
import { FormStep } from '../components/FormStep.jsx';
import { FundingSaveRail } from '../components/FundingSaveRail.jsx';
import SaveIcon from '@mui/icons-material/Save';
import { agreementFormDefaults, fundingFormDefaults, fundingSchema } from '../validation/fundingSchema.js';

const AGREEMENT_FIELDS = Object.keys(agreementFormDefaults);
/** Fields inside the collapsible disbursement section — opened when one of them has an error. */
const DISBURSEMENT_FIELDS = [...DISBURSEMENT_ERROR_FIELDS, 'fcCurrency', 'fcAmount', 'fcRateDate', 'fcRate', 'lumpSumCriteria'];

const factLabelSx = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'text.secondary',
};

/** LC / FC — the donor's book. Shown once, under the donor (and in the summary). */
function bookOf(donor) {
  if (!donor) return null;
  return donor.fundSourceDomicile === 'FOREIGN' ? 'FC · Foreign contribution' : 'LC · Local contribution';
}

/** "12 months" / "45 days" between two ISO dates (inclusive), or null. */
function periodLength(start, end) {
  if (!start || !end || end < start) return null;
  const days = Math.round((new Date(end) - new Date(start)) / 86_400_000) + 1;
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  return `${Math.round(days / 30.44)} months`;
}

/** Pick only the agreement fields out of grant form values. */
function agreementValuesOf(grant) {
  const all = toGrantFormValues(grant);
  return Object.fromEntries(AGREEMENT_FIELDS.map((k) => [k, all[k] ?? '']));
}

/** The chosen donor at a glance: name, code, and the facts that follow from it. */
function DonorFacts({ donor }) {
  if (!donor) {
    return (
      <Typography variant="body2" color="text.secondary">
        Pick a donor to see their book and FCRA status.
      </Typography>
    );
  }
  const foreign = donor.fundSourceDomicile === 'FOREIGN';
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          flexShrink: 0,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'var(--card2)',
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        {(donor.donorName || '?').trim().charAt(0).toUpperCase()}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {donor.donorName}
          <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontFamily: 'monospace', fontWeight: 400, fontSize: 12 }}>
            {donor.donorCode}
          </Box>
        </Typography>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', mt: 0.5 }}>
          <StatusChip label={`Book: ${bookOf(donor)}`} tone={foreign ? 'graphite' : 'neutral'} />
          {foreign ? (
            <StatusChip
              label={donor.fcraApplicable ? 'FCRA applicable' : 'FCRA not applicable'}
              tone={donor.fcraApplicable ? 'warning' : 'outlined'}
            />
          ) : null}
          {donor.donorTypeLabel && donor.donorTypeLabel !== '—' ? (
            <StatusChip label={donor.donorTypeLabel} tone="outlined" />
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}

/**
 * The single Funding form: who the money is from, the terms attached to it
 * (fund profile) and the signed grant agreement — saved together.
 *
 * Saving is one call (POST/PUT /api/v1/funding): the server saves the terms
 * and the agreement together, or neither. It also names the agreement.
 */
function FundingForm({ mode, profile, grant, donors, initialValues }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = mode === 'edit';
  // Server messages that don't belong to a single field on the form.
  const [serverMessages, setServerMessages] = useState([]);
  const [disbursementOpen, setDisbursementOpen] = useState(true);
  const { user } = useAuth();
  const [changeNote, setChangeNote] = useState('');
  const historyQuery = useFundingHistory(isEdit ? profile.id : null);
  const lastEdit = historyQuery.data?.[0];

  const {
    control,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(fundingSchema), defaultValues: initialValues });

  // Watch the whole form: the summary panel and step markers update live.
  const values = useWatch({ control });
  const { donorId, withAgreement, totalAmount } = values;
  const agreement = values.agreement || {};

  const donor = donors.find((d) => String(d.id) === String(donorId));
  const foreignBook = donor?.fundSourceDomicile === 'FOREIGN';

  // FC fields are required for FC-book funding (they derive the INR total) —
  // except when editing a record saved before they existed.
  const hadFc = Boolean(profile?.disbursementRules?.[0]?.foreign);
  useEffect(() => {
    setValue('requireFc', foreignBook && (!isEdit || hadFc));
    setValue('fcActive', foreignBook);
  }, [foreignBook, isEdit, hadFc, setValue]);
  const donorOptions = donors.map((d) => ({ value: String(d.id), label: `${d.donorName} (${d.donorCode})` }));

  const save = useMutation({
    // Who is saving and (when editing) why — stored in the record's change history.
    mutationFn: (formValues) => {
      const meta = { actor: user?.name, changeNote: isEdit ? changeNote : undefined };
      return isEdit ? fundingService.update(profile.id, formValues, meta) : fundingService.create(formValues, meta);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.funding.all() });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const submit = handleSubmit(
    async (formValues) => {
      setServerMessages([]);
      try {
        const saved = await save.mutateAsync(formValues);
        navigate(`/funding/${saved.id}`, { replace: true });
      } catch (error) {
        // Server field errors are keyed by request path (terms.…, agreement.…).
        const { fieldErrors, otherMessages } = toFormErrors(error?.fieldErrors, formValues);
        for (const [field, message] of Object.entries(fieldErrors)) {
          setError(field, { type: 'server', message });
        }
        setServerMessages(otherMessages);
        if (Object.keys(fieldErrors).some((f) => DISBURSEMENT_FIELDS.some((d) => f === d || f.startsWith(`${d}.`)))) {
          setDisbursementOpen(true);
        }
      }
    },
    (formErrors) => {
      if (DISBURSEMENT_FIELDS.some((field) => formErrors[field])) setDisbursementOpen(true);
    },
  );

  const errorMessages = [
    ...serverMessages,
    ...Object.entries(errors)
      .filter(([key, e]) => key !== 'agreement' && !Array.isArray(e) && e?.message)
      .map(([, e]) => e.message),
    ...(errors.tranches ? ['One or more tranches have missing or invalid fields'] : []),
    ...(errors.lumpSumCriteria ? ['Lump sum: release criteria are missing or incomplete'] : []),
    ...Object.values(errors.agreement || {})
      .map((e) => e?.message)
      .filter(Boolean)
      .map((m) => `Agreement: ${m}`),
  ];

  const backTo = isEdit ? `/funding/${profile.id}` : '/funding';
  const dateProps = { type: 'date', slotProps: { inputLabel: { shrink: true } } };
  const committed = Number(totalAmount) > 0 ? formatInrExact(totalAmount) : null;
  const period = periodLength(agreement.startDate, agreement.endDate);
  const documentError = errors.agreement?.agreementDocumentPath?.message || null;
  const donorLocked = isEdit;
  const scheduleReady =
    values.disbursementType === 'LUMP_SUM' ? Boolean(values.receivingDate) : (values.tranches || []).length > 0;

  const steps = [
    { id: 'step-donor', title: 'Donor', hint: 'Pick whose money this is', label: 'Donor chosen', status: donor ? 'done' : 'todo' },
    { id: 'step-terms', title: 'Terms', hint: 'Class and payment schedule', label: 'Class & payment schedule set', status:
        values.fundClass && committed && scheduleReady && (!values.programmeTied || values.programmeId) ? 'done' : 'todo' },
    {
      id: 'step-agreement',
      title: 'Grant agreement',
      hint: 'Dates and signed document',
      label: withAgreement ? 'Agreement dates & document set' : 'Agreement — add later',
      status: !withAgreement
        ? 'skipped'
        : agreement.agreementDate && agreement.startDate && agreement.endDate && agreement.agreementDocumentPath
          ? 'done'
          : 'todo',
    },
  ];

  const trancheCount = (values.tranches || []).length;
  const facts = [
    { label: 'Donor', value: donor?.donorName },
    { label: 'Book', value: donor ? (foreignBook ? `FC${values.fcCurrency ? ` · ${values.fcCurrency}` : ''}` : 'LC') : null },
    { label: 'Committed', value: committed },
    {
      label: 'Schedule',
      value:
        values.disbursementType === 'LUMP_SUM'
          ? 'One payment'
          : trancheCount
            ? `${trancheCount} tranche${trancheCount === 1 ? '' : 's'}`
            : null,
    },
    {
      label: 'Agreement',
      value: withAgreement ? [grant?.grantCode || 'New', period].filter(Boolean).join(' · ') : 'Add later',
    },
  ];
  const saveLabel = isEdit ? 'Save changes' : withAgreement ? 'Save funding' : 'Save terms';
  const lastChange = isEdit
    ? `${lastEdit ? `Last change: ${lastEdit.actionLabel.toLowerCase()}${lastEdit.changedBy ? ` by ${lastEdit.changedBy}` : ''}, ${formatDateTime(lastEdit.changedAt)}. ` : ''}Every change is logged.`
    : 'Codes and the agreement name are assigned on save.';
  const problemCount = new Set(errorMessages).size + (save.error && !errorMessages.length ? 1 : 0);

  return (
    <Box
      component="form"
      onSubmit={submit}
      noValidate
      sx={{
        display: 'grid',
        gap: 2.5,
        alignItems: 'start',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 300px' },
        maxWidth: 1380,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {save.error || errorMessages.length ? (
          <Stack spacing={1.5} sx={{ mb: 3 }}>
            {save.error ? (
              <Alert severity="error">
                {save.error.fieldErrors
                  ? 'Nothing was saved — fix the highlighted fields and save again.'
                  : `Nothing was saved: ${save.error.message}`}
              </Alert>
            ) : null}
            {errorMessages.length ? (
              <Alert severity="error">
                <Stack spacing={0.25}>
                  {[...new Set(errorMessages)].map((message) => (
                    <Typography key={message} variant="body2">
                      {message}
                    </Typography>
                  ))}
                </Stack>
              </Alert>
            ) : null}
          </Stack>
        ) : null}

        <Stack spacing={2.5}>
        {/* 1 · Donor — the only place in the form the book (LC / FC) is shown */}
        <FormStep id="step-donor" step={1} total={3} title="Donor" subtitle="Whose money this is." status={steps[0].status}>
              <RhfAutocomplete
                name="donorId"
                control={control}
                label="Donor"
                required
                options={donorOptions}
                placeholder="Search by name or code…"
                disabled={donorLocked}
                helperText={donorLocked ? 'The donor cannot change once the terms are saved' : undefined}
              />
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px dashed', borderColor: 'divider' }}>
                <DonorFacts donor={donor} />
              </Box>
        </FormStep>

        {/* 2 · Terms (fund profile) — no bookValue passed, so no second Book field */}
        <FormStep
          id="step-terms"
          step={2}
          total={3}
          flush
          title="Terms"
          subtitle="How the money may be used — restriction class, spending rules, and when it arrives."
          status={steps[1].status}
        >
          <FundProfileFields
            control={control}
            setValue={setValue}
            errors={errors}
            disbursementOpen={disbursementOpen}
            onDisbursementOpenChange={setDisbursementOpen}
            bare
            foreignBook={foreignBook}
          />
        </FormStep>

        {/* 3 · Agreement (grant) */}
        <FormStep
          id="step-agreement"
          step={3}
          total={3}
          title="Grant agreement"
          subtitle={withAgreement ? 'The signed agreement on these terms.' : 'Skipped for now — record it later from the funding page.'}
          status={steps[2].status}
          action={
            grant ? null : (
              <Controller
                name="withAgreement"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    sx={{ mr: 0, flexShrink: 0, '& .MuiFormControlLabel-label': { fontSize: 13, fontWeight: 600 } }}
                    control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                    label="Record now"
                    labelPlacement="start"
                  />
                )}
              />
            )
          }
        >
          {withAgreement ? (
            <>
                {grant ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Grant code{' '}
                    <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'text.primary' }}>
                      {grant.grantCode}
                    </Box>
                  </Typography>
                ) : null}

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <RhfTextField name="agreement.agreementDate" control={control} label="Signed on" required {...dateProps} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <RhfTextField name="agreement.startDate" control={control} label="Start date" required {...dateProps} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <RhfTextField name="agreement.endDate" control={control} label="End date" required {...dateProps} />
                  </Grid>
                </Grid>

                {/* Read-only facts that follow from the terms and the dates. */}
                <Box
                  sx={{
                    mt: 2,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    borderRadius: 2,
                    bgcolor: 'var(--card2)',
                    '& > *': { px: 2, py: 1.25 },
                    '& > *:first-of-type': {
                      borderRight: { sm: '1px solid' },
                      borderBottom: { xs: '1px solid', sm: 'none' },
                      borderColor: 'divider',
                    },
                  }}
                >
                  <Box>
                    <Typography sx={factLabelSx}>Grant amount</Typography>
                    <Typography sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{committed || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      From the payment schedule in step 2
                    </Typography>
                  </Box>
                  <Box>
                    <Typography sx={factLabelSx}>Agreement period</Typography>
                    <Typography sx={{ fontWeight: 700 }}>{period || '—'}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {period ? 'Start to end, inclusive' : 'Set the start and end dates'}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 2.5 }}>
                  <RhfTextField name="agreement.description" control={control} label="Remarks (optional)" multiline minRows={2} />
                </Box>

                {/* Document picker (required) — records the file name only. */}
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.5}
                  role="group"
                  aria-invalid={Boolean(documentError)}
                  sx={{
                    mt: 2,
                    p: 1.5,
                    borderRadius: 2,
                    border: '1px dashed',
                    borderColor: documentError ? 'error.main' : agreement.agreementDocumentPath ? 'var(--ok)' : 'divider',
                    bgcolor: documentError ? 'var(--err-bg)' : 'transparent',
                    alignItems: { sm: 'center' },
                  }}
                >
                  <Stack direction="row" spacing={1.25} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                    <EventNoteOutlinedIcon
                      sx={{ color: documentError ? 'error.main' : agreement.agreementDocumentPath ? 'var(--ok)' : 'text.secondary' }}
                    />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {agreement.agreementDocumentPath || 'Signed agreement document *'}
                      </Typography>
                      <Typography variant="caption" sx={{ color: documentError ? 'error.main' : 'text.secondary' }}>
                        {documentError || 'Required · only the file name is recorded, the file is not uploaded'}
                      </Typography>
                    </Box>
                  </Stack>
                  <Button
                    component="label"
                    variant={agreement.agreementDocumentPath ? 'outlined' : 'contained'}
                    color={documentError ? 'error' : 'primary'}
                    size="small"
                    startIcon={<UploadFileIcon />}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {agreement.agreementDocumentPath ? 'Change file' : 'Choose file'}
                    <input
                      type="file"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setValue('agreement.agreementDocumentPath', file.name, { shouldValidate: true, shouldDirty: true });
                      }}
                    />
                  </Button>
                </Stack>
            </>
          ) : (
            <Box sx={{ px: 2.5, py: 2, borderRadius: 2, border: '1px dashed', borderColor: 'divider', color: 'text.secondary', fontSize: 14 }}>
              Only the terms will be saved. The funding shows as <strong>Terms only</strong> until an agreement is recorded.
            </Box>
          )}
        </FormStep>
        </Stack>
      </Box>

      {/* Save bar — narrow screens: sticks to the bottom of the viewport on this long form. */}
      <Card
        sx={{
          position: 'sticky',
          bottom: 16,
          zIndex: 2,
          px: { xs: 2, md: 3 },
          py: 1.5,
          display: { xs: 'flex', lg: 'none' },
          gap: 1.5,
          alignItems: 'center',
          flexWrap: 'wrap',
          boxShadow: 'var(--shadow)',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Typography variant="body2" color="text.secondary">
            {profile
              ? [profile.profileCode, grant?.grantCode].filter(Boolean).join(' · ')
              : 'Codes and the agreement name are assigned automatically on save'}
            {!isEdit && withAgreement ? ' · agreement starts as pending approval' : ''}
          </Typography>
          {isEdit ? (
            <Typography variant="caption" color="text.secondary" component="div">
              {lastEdit
                ? `Last change: ${lastEdit.actionLabel.toLowerCase()}${lastEdit.changedBy ? ` by ${lastEdit.changedBy}` : ''} · ${formatDateTime(lastEdit.changedAt)} · `
                : ''}
              every change is logged
            </Typography>
          ) : null}
        </Box>
        {isEdit ? (
          <TextField
            size="small"
            label="Reason for change (optional)"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            inputProps={{ maxLength: 1000 }}
            sx={{ flex: '1 1 260px', maxWidth: 380 }}
          />
        ) : null}
        <Button color="inherit" onClick={() => navigate(backTo)} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : saveLabel}
        </Button>
      </Card>

      {/* Wide screens: sections, summary and Save stay in view beside the form. */}
      <Box sx={{ display: { xs: 'none', lg: 'block' }, position: 'sticky', top: 76, gridColumn: 2, gridRow: '1 / span 2' }}>
        <FundingSaveRail
          steps={steps}
          facts={facts}
          isEdit={isEdit}
          changeNote={changeNote}
          onChangeNote={setChangeNote}
          lastChange={lastChange}
          problemCount={problemCount}
          saving={save.isPending}
          saveLabel={saveLabel}
          onCancel={() => navigate(backTo)}
        />
      </Box>
    </Box>
  );
}

/**
 * /funding/new[?donorId=]            — new funding (terms + agreement)
 * /funding/:id/edit[?step=agreement] — edit both; `step=agreement` turns on
 *                                      "Record now" when there's no agreement yet.
 */
export function FundingFormPage({ mode }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const donorsQuery = useDonors('');
  const record = useFundingRecord(mode === 'edit' ? id : null);
  const isEdit = mode === 'edit';

  const loading = donorsQuery.isPending || (isEdit && record.query.isPending);
  if (loading) return <LoadingState label="Loading funding form…" />;
  const failed = [donorsQuery, ...(isEdit ? [record.query] : [])].find((q) => q.isError);
  if (failed) return <ErrorState error={failed.error} onRetry={failed.refetch} />;

  const { profile, grant } = record;
  const initialValues = isEdit
    ? {
        ...fundingFormDefaults,
        ...toFundProfileFormValues(profile),
        donorId: String(profile.donorId),
        withAgreement: Boolean(grant) || searchParams.get('step') === 'agreement',
        agreement: grant ? agreementValuesOf(grant) : agreementFormDefaults,
      }
    : { ...fundingFormDefaults, donorId: searchParams.get('donorId') || '' };

  return (
    <>
      <Breadcrumbs
        items={
          isEdit
            ? [
                { label: 'Funding Agreements', onClick: () => navigate('/funding') },
                { label: grant?.grantCode || profile.profileCode, onClick: () => navigate(`/funding/${id}`) },
                { label: 'Edit' },
              ]
            : [{ label: 'Funding Agreements', onClick: () => navigate('/funding') }, { label: 'New funding' }]
        }
      />
      <PageHeader
        eyebrow={isEdit ? [profile.profileCode, grant?.grantCode].filter(Boolean).join(' · ') : null}
        title={isEdit ? 'Edit funding' : 'New funding'}
        subtitle={
          isEdit
            ? `${grant?.agreementName || profile.purpose || profile.profileCode} — terms and agreement are saved together, and every change is logged.`
            : 'The donor, the terms attached to their money, and the agreement signed on them — saved together.'
        }
      />
      <FundingForm
        mode={mode}
        profile={profile}
        grant={grant}
        donors={donorsQuery.data || []}
        initialValues={initialValues}
      />
    </>
  );
}
