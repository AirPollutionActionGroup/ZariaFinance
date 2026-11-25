import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { GeographyMultiSelect, RhfSelect, RhfTextField } from '../../../shared/components/index.js';
import { useProgramme, useProgrammes } from '../hooks/useProgrammes.js';
import { geographyService } from '../services/geographyService.js';
import { TrancheCard } from './TrancheCard.jsx';
import { CityMultiSelect } from './CityMultiSelect.jsx';
import { CriterionFields } from './CriterionFields.jsx';
import { UtilisationRuleRow } from './UtilisationRuleRow.jsx';
import { emptyCriterion } from '../mappers/disbursementMapper.js';
import { useRoleDesignations } from '../hooks/useRoleDesignations.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { ForeignContributionFields, formatForeign, inrFromForeign } from './ForeignContributionFields.jsx';

const FUND_MODE_OPTIONS = [
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'UNRESTRICTED', label: 'Unrestricted' },
];
/** Labels mirror the backend FundClass enum; `mode` is the Fund mode each class belongs to. */
const FUND_CLASS_OPTIONS = [
  { value: 'CLASS_A_RESTRICTED', label: 'Class A – Restricted', mode: 'RESTRICTED' },
  { value: 'CLASS_B_UNRESTRICTED', label: 'Class B · Unrestricted w/ explanation', mode: 'UNRESTRICTED' },
  { value: 'CLASS_C_UNRESTRICTED', label: 'Class C · Fully unrestricted', mode: 'UNRESTRICTED' },
];
const REPORTING_OPTIONS = [
  { value: '', label: '—' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-yearly' },
  { value: 'ANNUAL', label: 'Annual' },
];
const SCHEDULE_FREQUENCY_OPTIONS = [
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'HALF_YEARLY', label: 'Half-Yearly' },
  { value: 'YEARLY', label: 'Yearly' },
  // No fixed cadence — each tranche keeps its own expected release date.
  { value: 'DATED', label: 'Dated' },
];
const LINK_TYPE_OPTIONS = [
  { value: '', label: 'Untied (no programme)' },
  { value: 'PROGRAMME', label: 'Programme' },
  { value: 'PROJECT', label: 'Project' },
];

/** Inline RHF-bound switch (booleans aren't covered by the shared form components). */
function RhfSwitch({ name, control, label, onChangeExtra, disabled = false, title }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControlLabel
          title={title}
          disabled={disabled}
          control={
            <Switch
              checked={Boolean(field.value)}
              onChange={(e) => {
                field.onChange(e.target.checked);
                onChangeExtra?.(e.target.checked);
              }}
            />
          }
          label={label}
        />
      )}
    />
  );
}

/**
 * Wraps one field section: its own Card by default, or — when the parent
 * already supplies the card (`bare`) — a padded block separated by a rule.
 */
function SectionShell({ bare, first = false, children }) {
  if (bare) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5, borderTop: first ? 'none' : '1px solid', borderColor: 'divider' }}>
        {children}
      </Box>
    );
  }
  return (
    <Card>
      <CardContent sx={{ p: 3 }}>{children}</CardContent>
    </Card>
  );
}

/** Form fields that trigger the Disbursement Schedule section's "required" state. */
export const DISBURSEMENT_ERROR_FIELDS = ['totalAmount', 'disbursementType', 'receivingDate', 'lumpSumCriteria', 'frequency', 'tranches'];

/** Tranche colours on the allocation bar, in order. */
const TRANCHE_COLORS = ['var(--ink)', 'var(--info)', 'var(--ok)', 'var(--warn)', 'var(--muted)'];

/**
 * How the committed amount is split across the tranches: one segment per
 * tranche, the unallocated rest in grey — and whether it adds up.
 */
function AllocationBar({ tranches, field, committed, allocated, state, format }) {
  const tone = { full: 'var(--ok)', under: 'var(--warn)', over: 'var(--err)' }[state];
  const remaining = committed - allocated;
  const scale = Math.max(committed, allocated) || 1;
  return (
    <Box
      role={state === 'over' ? 'alert' : undefined}
      sx={{ mb: 1.5, px: 2, py: 1.25, borderRadius: 2, border: '1px solid var(--line)', bgcolor: 'var(--card2)' }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={2} sx={{ mb: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 13 }}>
          Allocated <strong>{format(allocated)}</strong> of {format(committed)}
        </Typography>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: tone }}>
          {state === 'full' ? 'Fully allocated' : state === 'under' ? `${format(remaining)} left to allocate` : `Over by ${format(-remaining)}`}
        </Typography>
      </Stack>
      <Box sx={{ display: 'flex', gap: '2px', height: 8, borderRadius: 4, overflow: 'hidden', bgcolor: 'var(--line)' }} aria-hidden>
        {tranches.map((t, i) => {
          const value = Number(t?.[field]) || 0;
          return value > 0 ? (
            <Box key={i} sx={{ width: `${(value / scale) * 100}%`, bgcolor: state === 'over' ? 'var(--err)' : TRANCHE_COLORS[i % TRANCHE_COLORS.length] }} />
          ) : null;
        })}
      </Box>
      {state === 'over' ? (
        <Typography sx={{ fontSize: 12, color: 'var(--err)', mt: 0.75 }}>Tranches can't add up to more than the committed amount.</Typography>
      ) : null}
    </Box>
  );
}

/**
 * The fund-profile field sections — Behaviour, Geographies, Utilisation rules
 * and Disbursement schedule — bound to a parent react-hook-form instance.
 * Shared by the stand-alone fund profile form and the combined Funding form,
 * so both always offer exactly the same fields and rules.
 *
 * The parent owns the form (useForm with fundProfileSchema fields at the top
 * level), submission, and whether the Disbursement section is open (so it can
 * open it on a validation error or when loading an existing schedule).
 *
 * `bookValue` is optional: leave it out when the parent already shows the
 * donor's book (the Funding form does), and the Behaviour row drops it.
 * `bare` renders the sections without their own cards, for a parent card.
 * `foreignBook` (FC donor) adds currency / amount / FX rate to the
 * Disbursement Schedule and derives the INR total from them.
 */
export function FundProfileFields({
  control,
  setValue,
  errors,
  bookValue,
  disbursementOpen,
  onDisbursementOpenChange,
  bare = false,
  foreignBook = false,
}) {
  // Compact headings when embedded in a parent card; the stand-alone page keeps its larger ones.
  const headingProps = bare
    ? { variant: 'subtitle1', component: 'h3', sx: { fontWeight: 700, fontSize: 15, lineHeight: 1.4, color: 'text.primary' } }
    : { variant: 'h4', component: 'h2' };
  const hintSx = { fontSize: 13, color: 'text.secondary', mt: 0.25 };

  // FC book: the INR total is derived from the foreign amount × FX rate.
  const fcCurrency = useWatch({ control, name: 'fcCurrency' });
  const fcAmount = useWatch({ control, name: 'fcAmount' });
  const fcRate = useWatch({ control, name: 'fcRate' });
  const derivedInr = foreignBook ? inrFromForeign(fcAmount, fcRate) : null;
  const fx = foreignBook ? { currency: fcCurrency, rate: fcRate } : null;
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const showBook = bookValue != null;
  const programmesQuery = useProgrammes();
  const { options: roleOptions } = useRoleDesignations();

  const [geographiesOpen, setGeographiesOpen] = useState(false);
  const [utilisationRulesOpen, setUtilisationRulesOpen] = useState(false);

  const utilisationRules = useFieldArray({ control, name: 'utilisationRules' });
  const tranches = useFieldArray({ control, name: 'tranches' });
  // A new form opens its first tranche; saved tranches (editing) start collapsed.
  const [expandedIndex, setExpandedIndex] = useState(() => (tranches.fields.some((t) => t.trancheCode) ? null : 0));
  const lumpSumCriteria = useFieldArray({ control, name: 'lumpSumCriteria' });
  // A saved lump sum is one tranche on the server, with its own permanent code.
  const lumpSumTrancheCode = useWatch({ control, name: 'lumpSumTrancheCode' });

  const disbursementType = useWatch({ control, name: 'disbursementType' });
  const frequency = useWatch({ control, name: 'frequency' });
  const trancheValues = useWatch({ control, name: 'tranches' });
  const totalAmountValue = useWatch({ control, name: 'totalAmount' });
  // Tranches vs the commitment — in the foreign currency for FC, else INR.
  const allocField = fx ? 'fcAmount' : 'amount';
  const allocCommitted = Number(fx ? fcAmount : totalAmountValue) || 0;
  const allocated = (trancheValues || []).reduce((sum, t) => sum + (Number(t?.[allocField]) || 0), 0);
  const remaining = allocCommitted - allocated;
  const allocState = Math.abs(remaining) < 0.005 ? 'full' : remaining > 0 ? 'under' : 'over';
  const fmtAlloc = (n) =>
    fx ? formatForeign(fcCurrency, n) : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const hasFinalTranche = (trancheValues || []).some((t) => Boolean(t?.isFinal));
  const [fundMode, fundClass, programmeTied] = useWatch({ control, name: ['fundMode', 'fundClass', 'programmeTied'] });
  const isRestricted = fundMode === 'RESTRICTED';
  const isUnrestricted = fundMode === 'UNRESTRICTED';

  const classOptions = FUND_CLASS_OPTIONS.filter((o) => !fundMode || o.mode === fundMode);

  // Fund mode decides Programme-tied and the class: Restricted → tied, Class A;
  // Unrestricted → not tied (which clears the Programme/Project), Class B or C.
  // Applied when the user changes the mode — not in an effect, so loading a
  // saved record (reset) can never rewrite its class or programme.
  const changeFundMode = (mode) => {
    const opts = { shouldDirty: true, shouldValidate: true };
    setValue('fundMode', mode, opts);
    if (mode === 'RESTRICTED') {
      setValue('fundClass', 'CLASS_A_RESTRICTED', opts);
      setValue('programmeTied', true, { shouldDirty: true });
    } else if (mode === 'UNRESTRICTED') {
      if (fundClass === 'CLASS_A_RESTRICTED') setValue('fundClass', '', { shouldDirty: true });
      setValue('programmeTied', false, { shouldDirty: true });
    }
  };
  const movementAllowed = useWatch({ control, name: 'movementAllowed' });
  const isPurposeRequired = movementAllowed && !programmeTied;
  const watchedProgrammeId = useWatch({ control, name: 'programmeId' });

  // A Project is a Programme row with type='Project' and a parentProgrammeId
  // — there's no separate Project entity (see Programme.java). A "Type"
  // picker decides which pickers are visible: Untied hides both, Programme
  // shows only the Programme picker, Project shows Programme (to narrow
  // down) followed by Project. Whichever is most specific is what's
  // submitted as programmeId. All three are local UI state, not RHF fields.
  const [linkType, setLinkType] = useState('');
  const [parentProgrammeId, setParentProgrammeId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const cascadeInitialised = useRef(false);

  // Initialise the cascade once from whatever programmeId the form already
  // holds (edit mode) — runs once the programme list has loaded.
  useEffect(() => {
    if (cascadeInitialised.current) return;
    if (!watchedProgrammeId || !(programmesQuery.data || []).length) return;
    const current = (programmesQuery.data || []).find((p) => String(p.id) === String(watchedProgrammeId));
    if (!current) return;
    cascadeInitialised.current = true;
    if (current.type === 'Project') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time UI sync when async programme data first arrives
      setLinkType('PROJECT');
      setParentProgrammeId(String(current.parentProgrammeId || ''));
      setSelectedProjectId(String(current.id));
    } else {
      setLinkType('PROGRAMME');
      setParentProgrammeId(String(current.id));
      setSelectedProjectId('');
    }
  }, [watchedProgrammeId, programmesQuery.data]);

  // Whichever level is most specific (Project, else Programme, else untied)
  // is what actually gets submitted.
  // Only once the pickers reflect the form (set up from a saved programmeId, or
  // changed by the user): before that they are still empty, and writing them
  // back would wipe the programme of a record opened for editing.
  useEffect(() => {
    if (!cascadeInitialised.current) return;
    const effective = selectedProjectId || parentProgrammeId || '';
    setValue('programmeId', effective, { shouldValidate: Boolean(effective) });
  }, [selectedProjectId, parentProgrammeId, setValue]);

  // Type/Programme/Project only make sense while Programme-tied is on —
  // switching it off clears the selection so the profile goes back to untied.
  useEffect(() => {
    if (!programmeTied && (linkType || parentProgrammeId || selectedProjectId)) {
      cascadeInitialised.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the cascade in response to programmeTied turning off
      setLinkType('');
      setParentProgrammeId('');
      setSelectedProjectId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to programmeTied turning off; the other values are what gets cleared, not triggers
  }, [programmeTied]);

  const handleLinkTypeChange = (newType) => {
    cascadeInitialised.current = true;
    setLinkType(newType);
    setParentProgrammeId('');
    setSelectedProjectId('');
  };
  const handleParentProgrammeChange = (newParentId) => {
    cascadeInitialised.current = true;
    setParentProgrammeId(newParentId);
    setSelectedProjectId('');
  };
  const selectedGeographies = useWatch({ control, name: 'selectedGeographies' }) || [];
  const statesQuery = useQuery({
    queryKey: ['geography', 'states'],
    queryFn: () => geographyService.listStates(),
    staleTime: 1000 * 60 * 60,
  });
  const stateNameById = new Map((statesQuery.data || []).map((s) => [String(s.value), s.label]));
  // Specific states picked (not empty, not "All") — only then can cities be narrowed down.
  const specificStates =
    !selectedGeographies || selectedGeographies.length === 0 || selectedGeographies.includes('ALL') ? [] : selectedGeographies;
  const selectedCities = useWatch({ control, name: 'selectedCities' }) || [];
  const cityCountByState = selectedCities.reduce((acc, v) => {
    const state = String(v).split(':')[0];
    acc[state] = (acc[state] || 0) + 1;
    return acc;
  }, {});
  const geographySubtitle = specificStates.length
    ? specificStates
        .map((id) => {
          const name = stateNameById.get(String(id)) || id;
          const cities = cityCountByState[String(id)];
          return cities ? `${name} (${cities} ${cities === 1 ? 'city' : 'cities'})` : name;
        })
        .join(', ')
    : 'No geographies — spendable anywhere';

  // Geographies follow the linked Programme / Project: offer only its states.
  // The Project's own states win; a Project without states uses its Programme's;
  // with no states on either (or no programme link) every state is offered.
  const programmeQuery = useProgramme(programmeTied && parentProgrammeId ? parentProgrammeId : null);
  const projectQuery = useProgramme(programmeTied && selectedProjectId ? selectedProjectId : null);
  const projectStateIds = projectQuery.data?.stateIds || [];
  const programmeStateIds = programmeQuery.data?.stateIds || [];
  const geographySource = projectStateIds.length
    ? projectQuery.data
    : programmeStateIds.length
      ? programmeQuery.data
      : null;
  const allowedStateIds = geographySource ? geographySource.stateIds : null;
  const allowedKey = allowedStateIds ? allowedStateIds.join(',') : '';

  // When the allowed states change, drop any selected state (or "All") outside them.
  useEffect(() => {
    if (!allowedStateIds) return;
    const allowed = new Set(allowedStateIds.map(String));
    const kept = selectedGeographies.filter((id) => allowed.has(String(id)));
    if (kept.length !== selectedGeographies.length) {
      setValue('selectedGeographies', kept, { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the allowed set changes
  }, [allowedKey]);


  const handleToggleUtilisationRules = () => {
    const nextState = !utilisationRulesOpen;
    setUtilisationRulesOpen(nextState);
    if (nextState && utilisationRules.fields.length === 0) {
      utilisationRules.append({ ruleType: 'ADMIN_OVERHEAD_COST', limitPercentage: '', description: '' });
    }
  };

  const parentProgrammeOptions = [
    { value: '', label: 'Select a programme…' },
    ...(programmesQuery.data || [])
      .filter((p) => p.type !== 'Project')
      .map((p) => ({ value: String(p.id), label: p.programmeName })),
  ];

  const projectOptions = [
    { value: '', label: parentProgrammeId ? 'Select a project…' : 'Select a programme first' },
    ...(programmesQuery.data || [])
      .filter((p) => p.type === 'Project' && parentProgrammeId && String(p.parentProgrammeId) === parentProgrammeId)
      .map((p) => ({ value: String(p.id), label: p.programmeName })),
  ];

  const hasDisbursementError = DISBURSEMENT_ERROR_FIELDS.some((field) => errors[field]);
  // Array-level message (e.g. none added); per-row errors show on the rows themselves.
  const lumpSumCriteriaError = errors.lumpSumCriteria?.message || errors.lumpSumCriteria?.root?.message || null;

  return (
    <>
      {/* Behaviour */}
      <SectionShell bare={bare} first>
          <Typography {...headingProps}>Behaviour</Typography>
          <Typography sx={{ ...hintSx, mb: 2 }}>Restriction class, reporting, and how strictly spending is tied.</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, md: showBook ? 3 : 4 }}>
              <RhfSelect
                name="fundMode"
                control={control}
                label="Fund mode"
                options={FUND_MODE_OPTIONS}
                required
                onChange={(e) => changeFundMode(e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: showBook ? 3 : 4 }}>
              <RhfSelect
                name="fundClass"
                control={control}
                label="Fund class"
                options={classOptions}
                required
                disabled={isRestricted}
                helperText={
                  isRestricted
                    ? 'Restricted funds are always Class A'
                    : isUnrestricted
                      ? 'Choose Class B or Class C'
                      : undefined
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: showBook ? 3 : 4 }}>
              <RhfSelect name="reportingFrequency" control={control} label="Reporting frequency" options={REPORTING_OPTIONS} />
            </Grid>
            {showBook ? (
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <TextField
                  label="Book"
                  value={bookValue}
                  disabled
                  fullWidth
                  helperText="Derived from donor fund source domicile"
                />
              </Grid>
            ) : null}
            {/* Programme link — Fund mode decides whether it applies (Restricted: required). */}
            {programmeTied ? (
              <>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    select
                    fullWidth
                    label="Linked to"
                    required={isRestricted}
                    value={linkType}
                    onChange={(e) => handleLinkTypeChange(e.target.value)}
                    error={Boolean(errors.programmeId) && !linkType}
                    helperText={isRestricted ? 'Restricted funds tie to a Programme or Project' : 'Programme, Project, or nothing'}
                  >
                    {LINK_TYPE_OPTIONS.filter((option) => !(isRestricted && option.value === '')).map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, sm: linkType === 'PROJECT' ? 4 : 8 }}>
                  <TextField
                    select
                    fullWidth
                    label="Programme"
                    required
                    disabled={!linkType}
                    value={parentProgrammeId}
                    onChange={(e) => handleParentProgrammeChange(e.target.value)}
                    error={Boolean(errors.programmeId) && !parentProgrammeId}
                    helperText={
                      errors.programmeId && !parentProgrammeId
                        ? 'Select a programme'
                        : linkType
                          ? ' '
                          : 'Choose what it links to first'
                    }
                  >
                    {parentProgrammeOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                {/* Project only applies when the fund is linked to a Project. */}
                {linkType === 'PROJECT' ? (
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      select
                      fullWidth
                      label="Project"
                      disabled={!parentProgrammeId}
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      helperText={parentProgrammeId ? 'Narrow to a specific project' : 'Select a programme first'}
                    >
                      {projectOptions.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                ) : null}
              </>
            ) : null}

            {/* Budget-line movement rules. Programme-tied is set by Fund mode, so its
                switch only appears if no mode is chosen. */}
            <Grid size={{ xs: 12 }}>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                sx={{
                  gap: { xs: 0.5, sm: 3 },
                  px: 2,
                  py: 1,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  alignItems: { sm: 'center' },
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 150 }}>
                  Budget-line movement
                </Typography>
                {!isRestricted && !isUnrestricted ? (
                  <RhfSwitch name="programmeTied" control={control} label="Programme-tied" />
                ) : null}
                {/* Independent switches — each turns on/off on its own. */}
                <RhfSwitch name="movementAllowed" control={control} label="Movement allowed" />
                <RhfSwitch name="explanationRequired" control={control} label="Explanation required" />
              </Stack>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <RhfTextField
                name="purpose"
                control={control}
                label="Purpose"
                required={Boolean(isPurposeRequired)}
                helperText={isPurposeRequired ? 'Required when movement is allowed on untied money' : undefined}
              />
            </Grid>
          </Grid>
      </SectionShell>

      {/* Geographies */}
      <SectionShell bare={bare}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, cursor: 'pointer' }} onClick={() => setGeographiesOpen((prev) => !prev)}>
            <Box>
              <Typography {...headingProps}>Geographies</Typography>
              <Typography sx={hintSx}>{geographySubtitle}</Typography>
            </Box>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setGeographiesOpen((prev) => !prev); }}>
              {geographiesOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </Stack>
          <Collapse in={geographiesOpen}>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ mt: 1 }}>
              <GeographyMultiSelect
                name="selectedGeographies"
                control={control}
                label="Geography name"
                allowedStateIds={allowedStateIds}
                helperText={
                  geographySource
                    ? `Showing only the ${allowedStateIds.length === 1 ? 'state' : `${allowedStateIds.length} states`} of ${geographySource.type === 'Project' ? 'project' : 'programme'} “${geographySource.programmeName}”`
                    : "Select Indian states / UTs, or select All (defaults to 'No geographies — spendable anywhere' if left blank)"
                }
              />
              {specificStates.length ? (
                <Box sx={{ mt: 2 }}>
                  <CityMultiSelect
                    control={control}
                    setValue={setValue}
                    stateIds={specificStates}
                    stateNameById={stateNameById}
                  />
                </Box>
              ) : null}
            </Box>
          </Collapse>
      </SectionShell>

      {/* Utilisation rules */}
      <SectionShell bare={bare}>
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, cursor: 'pointer' }}
            onClick={handleToggleUtilisationRules}
          >
            <Box>
              <Typography {...headingProps}>Utilisation Rules</Typography>
              <Typography sx={hintSx}>
                {utilisationRules.fields.length
                  ? `${utilisationRules.fields.length} limit${utilisationRules.fields.length === 1 ? '' : 's'} on cost categories`
                  : 'Optional limits, such as a cap on admin overhead'}
              </Typography>
            </Box>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleUtilisationRules();
              }}
            >
              {utilisationRulesOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </Stack>
          <Collapse in={utilisationRulesOpen}>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={2}>
              {utilisationRules.fields.map((f, i) => (
                <Box key={f.id}>
                  {i > 0 ? <Divider sx={{ mb: 2 }} /> : null}
                  <UtilisationRuleRow
                    control={control}
                    path={`utilisationRules.${i}`}
                    index={i}
                    onRemove={() => utilisationRules.remove(i)}
                  />
                </Box>
              ))}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={() => utilisationRules.append({ ruleType: 'ADMIN_OVERHEAD_COST', limitPercentage: '', description: '' })} sx={{ mt: 2 }}>
              Add rule
            </Button>
          </Collapse>
      </SectionShell>

      {/* Disbursement Schedule */}
      <SectionShell bare={bare}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1, cursor: 'pointer' }} onClick={() => onDisbursementOpenChange(!disbursementOpen)}>
            <Box>
              <Typography {...headingProps} sx={{ ...headingProps.sx, ...(hasDisbursementError ? { color: 'error.main' } : null) }}>
                Disbursement Schedule {hasDisbursementError ? '— required' : ''}
              </Typography>
              <Typography sx={hintSx}>
                Set how this grant is released. Choose a single payment or a series of tranches, then attach the conditions that must be met before each release.
              </Typography>
            </Box>
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDisbursementOpenChange(!disbursementOpen); }}>
              {disbursementOpen ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            </IconButton>
          </Stack>

          <Collapse in={disbursementOpen}>
            <Divider sx={{ my: 2.5 }} />

            {/* 1 · How it is released */}
            <Grid container spacing={3} sx={{ alignItems: 'flex-start', mb: 2.5 }}>
              <Grid size={{ xs: 12, md: 5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13, mb: 0.75 }}>
                  Disbursement type *
                </Typography>
                <Controller
                  name="disbursementType"
                  control={control}
                  render={({ field }) => (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        bgcolor: isDarkMode ? 'action.hover' : 'var(--canvas, #F6F6F3)',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1.5,
                        p: 0.5,
                        gap: 0.5,
                      }}
                    >
                      <Button
                        type="button"
                        onClick={() => field.onChange('LUMP_SUM')}
                        sx={{
                          px: 2.5,
                          py: 0.75,
                          borderRadius: 1.2,
                          fontWeight: 600,
                          fontSize: 13,
                          textTransform: 'none',
                          color: field.value === 'LUMP_SUM' ? (isDarkMode ? '#181818' : '#fff') : 'text.primary',
                          bgcolor: field.value === 'LUMP_SUM' ? (isDarkMode ? '#fff' : '#181818') : 'transparent',
                          '&:hover': {
                            bgcolor: field.value === 'LUMP_SUM' ? (isDarkMode ? '#e0e0e0' : '#000') : 'action.hover',
                          },
                        }}
                      >
                        Lump sum
                      </Button>
                      <Button
                        type="button"
                        onClick={() => field.onChange('TRANCHES')}
                        sx={{
                          px: 2.5,
                          py: 0.75,
                          borderRadius: 1.2,
                          fontWeight: 600,
                          fontSize: 13,
                          textTransform: 'none',
                          color: field.value === 'TRANCHES' ? (isDarkMode ? '#181818' : '#fff') : 'text.primary',
                          bgcolor: field.value === 'TRANCHES' ? (isDarkMode ? '#fff' : '#181818') : 'transparent',
                          '&:hover': {
                            bgcolor: field.value === 'TRANCHES' ? (isDarkMode ? '#e0e0e0' : '#000') : 'action.hover',
                          },
                        }}
                      >
                        Tranches
                      </Button>
                    </Box>
                  )}
                />
              </Grid>
              {disbursementType === 'LUMP_SUM' ? null : (
                <Grid size={{ xs: 12, md: 7 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: 13, mb: 0.75 }}>
                    Schedule type *{' '}
                    <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                      {frequency === 'DATED' ? 'each tranche on its own date' : 'sets tranche frequency'}
                    </Typography>
                  </Typography>
                <Controller
                  name="frequency"
                  control={control}
                  render={({ field }) => (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {SCHEDULE_FREQUENCY_OPTIONS.map((sched) => {
                        const selected = field.value === sched.value;
                        return (
                          <Chip
                            key={sched.value}
                            label={sched.label}
                            onClick={() => field.onChange(sched.value)}
                            sx={{
                              px: 1.5,
                              py: 2,
                              fontWeight: 600,
                              fontSize: 13,
                              borderRadius: 2,
                              cursor: 'pointer',
                              bgcolor: selected ? '#F2E041' : 'background.paper',
                              color: selected ? '#181818' : 'text.primary',
                              border: '1px solid',
                              borderColor: selected ? '#F2E041' : 'divider',
                              '&:hover': {
                                bgcolor: selected ? '#ecd730' : 'action.hover',
                              },
                            }}
                          />
                        );
                      })}
                    </Stack>
                  )}
                />
                </Grid>
              )}
            </Grid>

            {/* 2 · Foreign contribution (FC book) */}
            {foreignBook ? <ForeignContributionFields control={control} setValue={setValue} /> : null}

            {/* 3 · How much (and, for a lump sum, when) */}
            <Grid container spacing={3} sx={{ alignItems: 'flex-start' }}>
              {/* Total Amount Committed */}
              <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="totalAmount"
                  control={control}
                  render={({ field, fieldState }) => (
                    <TextField
                      type="number"
                      label={foreignBook ? 'Total amount committed (INR)' : 'Total amount committed'}
                      required
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      placeholder="1,00,00,000"
                      fullWidth
                      error={Boolean(fieldState.error)}
                      helperText={
                        fieldState.error?.message ||
                        (derivedInr != null
                          ? `= ${fcCurrency} ${Number(fcAmount).toLocaleString('en-IN')} × ₹${fcRate} · ${formatInrExact(derivedInr)}`
                          : foreignBook
                            ? 'Calculated from the foreign amount and FX rate above.'
                            : disbursementType === 'LUMP_SUM'
                              ? 'The full amount the donor has committed.'
                              : 'Total committed for this profile. All tranches must add up to this figure.')
                      }
                      slotProps={{
                        htmlInput: { min: 0, step: '1', readOnly: derivedInr != null },
                        input: {
                          startAdornment: (
                            <InputAdornment position="start" sx={{ color: 'text.primary', fontWeight: 700, fontFamily: 'monospace' }}>
                              ₹
                            </InputAdornment>
                          ),
                          sx: {
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            fontSize: 15,
                            borderRadius: 1.5,
                            // Calculated from the FC fields — shaded to read as derived, not typed.
                            ...(derivedInr != null ? { bgcolor: 'var(--card2)' } : null),
                            '& ::placeholder': {
                              color: '#9a9a94',
                              opacity: 1,
                              fontWeight: 500,
                            },
                          },
                        },
                      }}
                    />
                  )}
                />
              </Grid>
              {disbursementType === 'LUMP_SUM' ? (
                <Grid size={{ xs: 12, sm: 6 }}>
                <Controller
                  name="receivingDate"
                  control={control}
                  render={({ field, fieldState }) => (
                    <TextField
                      type="date"
                      label="Expected release date"
                      required
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      fullWidth
                      error={Boolean(fieldState.error)}
                      helperText={fieldState.error?.message || 'The full committed amount is released on this date.'}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  )}
                />
                </Grid>
              ) : null}
            </Grid>

            {/* 3b · Lump sum: release criteria (required) */}
            {disbursementType === 'LUMP_SUM' ? (
              <Box sx={{ mt: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', fontWeight: 700, display: 'block' }}
                >
                  Release criteria *
                </Typography>
                <Typography sx={{ ...hintSx, mt: 0, mb: 1.5 }}>
                  What must happen before the lump sum is released. All criteria must be met.
                  {lumpSumTrancheCode ? (
                    <Box component="span" sx={{ ml: 1, fontFamily: 'monospace' }}>
                      · {lumpSumTrancheCode}
                    </Box>
                  ) : null}
                </Typography>
                {lumpSumCriteriaError ? (
                  <Typography role="alert" variant="body2" sx={{ color: 'error.main', mb: 1.5 }}>
                    {lumpSumCriteriaError}
                  </Typography>
                ) : null}
                <Stack spacing={2}>
                  {lumpSumCriteria.fields.map((field, i) => (
                    <CriterionFields
                      key={field.id}
                      control={control}
                      path={`lumpSumCriteria.${i}`}
                      index={i}
                      canRemove={lumpSumCriteria.fields.length > 1}
                      onRemove={() => lumpSumCriteria.remove(i)}
                      verificationRoleOptions={roleOptions}
                      responsibleRoleOptions={roleOptions}
                    />
                  ))}
                </Stack>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => lumpSumCriteria.append(emptyCriterion())}
                  sx={{ mt: 2, borderStyle: 'dashed', textTransform: 'none', fontWeight: 600 }}
                >
                  Add criteria
                </Button>
              </Box>
            ) : null}

            {/* 4 · Tranches */}
            {disbursementType === 'LUMP_SUM' ? null : (
              <Box sx={{ mt: 1 }}>
                <Divider sx={{ my: 3 }} />

                {/* Tranches: heading, allocation bar, one row per tranche, add button. */}
                <Stack direction="row" alignItems="flex-end" justifyContent="space-between" spacing={2} sx={{ mb: 1.5 }}>
                  <Box>
                    <Typography {...headingProps} sx={{ ...headingProps.sx, fontWeight: 700 }}>
                      Tranches{tranches.fields.length ? ` · ${tranches.fields.length}` : ''}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      One row per release, in date order. Each carries the conditions that must be met before it is paid.
                    </Typography>
                  </Box>
                </Stack>

                {tranches.fields.length > 0 && allocCommitted > 0 ? (
                  <AllocationBar
                    tranches={trancheValues || []}
                    field={allocField}
                    committed={allocCommitted}
                    allocated={allocated}
                    state={allocState}
                    format={fmtAlloc}
                  />
                ) : null}

                {tranches.fields.map((f, i) => (
                  <TrancheCard
                    key={f.id}
                    control={control}
                    index={i}
                    path={`tranches.${i}`}
                    expanded={expandedIndex === i}
                    onToggleExpanded={() => setExpandedIndex(expandedIndex === i ? null : i)}
                    onRemove={() => {
                      tranches.remove(i);
                      setExpandedIndex(null);
                    }}
                    share={allocCommitted > 0 ? (Number(trancheValues?.[i]?.[allocField]) || 0) / allocCommitted : null}
                    verificationRoleOptions={roleOptions}
                    responsibleRoleOptions={roleOptions}
                    fx={fx}
                    setValue={setValue}
                  />
                ))}

                {hasFinalTranche ? (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                    The last tranche is marked final — turn that off to add another.
                  </Typography>
                ) : (
                  <Button
                    type="button"
                    variant="outlined"
                    fullWidth
                    startIcon={<AddIcon />}
                    onClick={() => {
                      tranches.append({
                        trancheName: `Tranche ${tranches.fields.length + 1}`,
                        amount: '',
                        fcAmount: '',
                        expectedReleaseDate: '',
                        isFinal: false,
                        criteria: [emptyCriterion()],
                      });
                      setExpandedIndex(tranches.fields.length);
                    }}
                    sx={{ mt: 0.5, py: 1.1, borderStyle: 'dashed', borderColor: 'var(--line)', color: 'text.primary', fontWeight: 600 }}
                  >
                    {tranches.fields.length ? 'Add tranche' : 'Add the first tranche'}
                    {tranches.fields.length && allocState === 'under' ? ` · ${fmtAlloc(remaining)} left` : ''}
                  </Button>
                )}
              </Box>
            )}
          </Collapse>
      </SectionShell>
    </>
  );
}
