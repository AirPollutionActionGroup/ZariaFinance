import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Button, Card, CardContent, Grid, MenuItem, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../../core/auth/index.js';
import { ErrorState, LoadingState, PageHeader } from '../../../shared/components/index.js';
import { BudgetLineEditor, newLine } from '../components/BudgetLineEditor.jsx';
import { BudgetTypePicker } from '../components/BudgetTypePicker.jsx';
import { useBudget, useBudgetFinancialYears, useSaveBudget } from '../hooks/useBudgets.js';
import { FINANCIAL_YEAR_STATUS_LABEL } from '../../financial-year/constants.js';
import { isBudgetValid, validateBudget } from '../lib/budgetMath.js';
import { isFinancialYearLabel } from '../lib/financialYear.js';
import { SearchableSelect } from '../../../components/SearchableSelect.jsx';
import { useProgrammes } from '../../donor-management/hooks/useProgrammes.js';
import { geographyService } from '../../donor-management/services/geographyService.js';
import {
  BUDGET_STATUS,
  BUDGET_TYPE,
  CURRENT_FINANCIAL_YEAR,
  budgetTypeOf,
  isProjectRecord,
  needsProgramme,
} from '../constants.js';

/** Only Draft and Rejected budgets can be edited (the server enforces the same). */
const EDITABLE = ['DRAFT', 'REJECTED'];

function initialDraft(existing, owner, fyParam) {
  if (existing) {
    const budgetType = budgetTypeOf(existing);
    return {
      name: existing.name,
      financialYear: existing.financialYear,
      budgetType,
      programmeId: existing.programmeId ?? null,
      programme: needsProgramme(budgetType) ? existing.programme : '',
      stateId: existing.stateId ?? null,
      stateName: existing.stateName || '',
      owner: existing.owner,
      notes: existing.notes,
      lines: existing.lines.map((l) => ({ ...l })),
    };
  }
  const financialYear = isFinancialYearLabel(fyParam) ? fyParam : CURRENT_FINANCIAL_YEAR;
  return {
    name: '',
    financialYear,
    budgetType: 'PROGRAMME',
    programmeId: null,
    programme: '',
    stateId: null,
    stateName: '',
    owner: owner || '',
    notes: '',
    lines: [newLine()],
  };
}

/** The budget form itself; `existing` is the loaded budget when editing, null when creating. */
function BudgetForm({ existing }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  // A new budget starts on the FY chosen on the list page (?fy=2026-27); it can still be changed here.
  const [draft, setDraft] = useState(() => initialDraft(existing, user?.name, searchParams.get('fy')));
  // Years come from the Financial Year master. New work goes into an Active or
  // Upcoming year; a budget being edited keeps its own year even if it has closed.
  const fyMaster = useBudgetFinancialYears();
  const fyOptions = fyMaster.options.filter((fy) => fy.status !== 'CLOSED' || fy.label === existing?.financialYear);
  const selectedFy = fyOptions.find((fy) => fy.label === draft.financialYear) || null;
  const fyError = fyMaster.isError
    ? 'Could not load financial years from the server'
    : fyMaster.isSuccess && !selectedFy
      ? fyOptions.length
        ? `FY ${draft.financialYear} isn't open in the Financial Year master — pick another`
        : 'No open financial years — add one under Financial Year first'
      : null;
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const saveBudget = useSaveBudget();

  // Programme and State come from the real master data (server-backed).
  const programmesQuery = useProgrammes();
  // Programme budgets pick from Programme records, Project budgets from Project records
  // (grouped under their parent programme).
  const isProjectBudget = draft.budgetType === 'PROJECT';
  const programmeOptions = useMemo(() => {
    const records = (programmesQuery.data || []).filter((p) => isProjectRecord(p) === isProjectBudget);
    const options = records.map((p) => ({
      value: p.id,
      label: p.programmeName,
      group: isProjectBudget ? p.parentProgrammeName || 'No parent programme' : undefined,
    }));
    if (isProjectBudget) options.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
    // A budget saved with a programme name that isn't a Programme record (e.g. seed data) keeps it selectable.
    const saved = existing?.programme;
    if (
      budgetTypeOf(existing) === draft.budgetType &&
      draft.budgetType === 'PROGRAMME' &&
      saved &&
      !options.some((o) => o.label?.toLowerCase() === saved.toLowerCase())
    ) {
      options.unshift({ value: `name:${saved}`, label: saved });
    }
    return options;
  }, [programmesQuery.data, existing, isProjectBudget, draft.budgetType]);
  const scopeNoun = isProjectBudget ? 'project' : 'programme';
  // States share the cached list the Fund Profile form uses.
  const statesQuery = useQuery({
    queryKey: ['geography', 'states'],
    queryFn: () => geographyService.listStates(),
    staleTime: 1000 * 60 * 60,
  });
  const stateOptions = useMemo(() => statesQuery.data || [], [statesQuery.data]);
  // Seed budgets only carry the programme name, so fall back to matching on it.
  const selectedProgramme =
    programmeOptions.find((o) => o.value === draft.programmeId) ||
    programmeOptions.find((o) => o.label?.toLowerCase() === draft.programme?.toLowerCase()) ||
    null;
  // The chosen programme's states, from `stateNames` on the /programmes list,
  // matched to the state options by name.
  const isProgrammeBudget = needsProgramme(draft.budgetType);
  const programmeRecord =
    isProgrammeBudget && typeof draft.programmeId === 'number'
      ? (programmesQuery.data || []).find((p) => p.id === draft.programmeId)
      : null;
  /** The state option ids a programme runs in (matched by name); empty when it has none. */
  const stateIdsOf = useCallback(
    (programme) => {
      const names = new Set((programme?.stateNames || []).map((n) => n.trim().toLowerCase()));
      return new Set(stateOptions.filter((o) => names.has(o.label?.trim().toLowerCase())).map((o) => String(o.value)));
    },
    [stateOptions],
  );
  const programmeStateIds = useMemo(() => stateIdsOf(programmeRecord), [stateIdsOf, programmeRecord]);
  // A programme with states → only those states can be picked; one without → every state.
  const hasProgrammeStates = programmeStateIds.size > 0;
  const statesLoading = statesQuery.isLoading || (isProgrammeBudget && programmesQuery.isLoading);

  const selectedState =
    (draft.stateId != null && stateOptions.find((o) => String(o.value) === String(draft.stateId))) ||
    // Seed budgets carry only the state name.
    (draft.stateName && stateOptions.find((o) => o.label?.toLowerCase() === draft.stateName.toLowerCase())) ||
    null;
  // Only an older budget can be here (choosing a programme clears a state it doesn't run in):
  // it keeps showing, with a warning, rather than silently disappearing.
  const stateOutsideProgramme = Boolean(selectedState) && hasProgrammeStates && !programmeStateIds.has(String(selectedState.value));
  const availableStates = hasProgrammeStates
    ? [
        ...stateOptions.filter((o) => programmeStateIds.has(String(o.value))),
        ...(stateOutsideProgramme ? [selectedState] : []),
      ]
    : stateOptions;

  const errors = useMemo(() => validateBudget(draft), [draft]);
  const shown = showErrors ? errors : { header: {}, lines: {}, form: null };
  const backTo = existing ? `/budgets/${existing.id}` : `/budgets?fy=${draft.financialYear}`;

  if (existing && !EDITABLE.includes(existing.status)) {
    return (
      <ErrorState
        error={{ message: `${existing.budgetCode} is ${BUDGET_STATUS[existing.status].toLowerCase()} and can no longer be edited.` }}
      />
    );
  }

  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value }));

  const save = async (submit) => {
    setShowErrors(true);
    setSaveError(null);
    if (!isBudgetValid(errors) || !selectedFy) return;
    try {
      const saved = await saveBudget.mutateAsync({
        id: existing?.id ?? null,
        draft: { ...draft, financialYearId: selectedFy.id },
        meta: { submit, actor: user?.name || 'You' },
      });
      navigate(`/budgets/${saved.id}`);
    } catch (err) {
      // Server-side rule failures (e.g. an inactive category) come back as a readable message.
      setSaveError(err.message || 'Could not save the budget.');
    }
  };

  const fyLabel = selectedFy ? selectedFy.code : `FY ${draft.financialYear}`;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <Button startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2, color: 'text.secondary' }} onClick={() => navigate(backTo)}>
        {existing ? existing.budgetCode : 'Budgets'}
      </Button>

      <PageHeader
        eyebrow={fyLabel}
        title={existing ? `Edit ${existing.budgetCode}` : 'New budget'}
        subtitle="Choose what the budget is for, fill in its details, then phase each line across the four quarters."
      />

      {existing?.status === 'REJECTED' ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          This budget was returned for revision. Saving moves it back to Draft.
        </Alert>
      ) : null}
      {saveError ? <Alert severity="error" sx={{ mb: 3 }}>{saveError}</Alert> : null}

      <Stack spacing={3} sx={{ minWidth: 0 }}>
        <FormSection step={1} title="Budget type" subtitle="What is this budget planned for?">
          <BudgetTypePicker
            hideLabel
            value={draft.budgetType}
            error={shown.header.budgetType}
            onChange={(code) =>
              setDraft((d) =>
                // A programme can't stand in for a project (or the other way round): switching clears the pick.
                d.budgetType === code ? d : { ...d, budgetType: code, programmeId: null, programme: '' },
              )
            }
          />
        </FormSection>

        <FormSection
          step={2}
          title="Details"
          subtitle={
            isProgrammeBudget
              ? `Name the budget and choose the ${scopeNoun} and state it covers.`
              : 'Name the budget and, if it is for one state only, choose it.'
          }
        >
          <Grid container spacing={2}>
            <Grid size={12}>
              <TextField
                fullWidth
                label="Budget name *"
                placeholder="e.g. Clean Air field operations FY 2026-27"
                value={draft.name}
                onChange={set('name')}
                error={Boolean(shown.header.name)}
                helperText={shown.header.name}
              />
            </Grid>
            {isProgrammeBudget ? (
              <Grid size={{ xs: 12, md: 6 }}>
                <SearchableSelect
                  // Remount on type change: MUI's Autocomplete can't switch groupBy on and off in place.
                  key={draft.budgetType}
                  label={isProjectBudget ? 'Project *' : 'Programme *'}
                  options={programmeOptions}
                  groupBy={isProjectBudget ? (o) => o.group : undefined}
                  value={selectedProgramme}
                  onChange={(opt) =>
                    setDraft((d) => {
                      // A name-only option (seed data) has no Programme record id.
                      const programmeId = opt && !String(opt.value).startsWith('name:') ? opt.value : null;
                      // Keep the state only if the new programme runs there (or runs in no set states).
                      const newStates = stateIdsOf((programmesQuery.data || []).find((p) => p.id === programmeId));
                      const keepState = d.stateId == null || newStates.size === 0 || newStates.has(String(d.stateId));
                      return {
                        ...d,
                        programmeId,
                        programme: opt?.label || '',
                        ...(keepState ? {} : { stateId: null, stateName: '' }),
                      };
                    })
                  }
                  loading={programmesQuery.isLoading}
                  placeholder={programmesQuery.isError ? 'Could not load programmes' : `Select the ${scopeNoun}`}
                  error={shown.header.programme || (programmesQuery.isError ? 'Could not load programmes from the server' : null)}
                  helperText={
                    isProjectBudget && programmesQuery.isSuccess && programmeOptions.length === 0
                      ? 'No projects yet — add one under Programmes (type Project).'
                      : undefined
                  }
                />
              </Grid>
            ) : null}
            <Grid size={{ xs: 12, md: isProgrammeBudget ? 6 : 12 }}>
              <SearchableSelect
                label="State (location)"
                options={availableStates}
                value={selectedState}
                onChange={(opt) => setDraft((d) => ({ ...d, stateId: opt?.value ?? null, stateName: opt?.label || '' }))}
                loading={statesLoading}
                placeholder="Leave empty for all states"
                error={statesQuery.isError ? 'Could not load states — the budget will cover all states' : null}
              />
              {hasProgrammeStates ? (
                <Typography
                  variant="caption"
                  color={stateOutsideProgramme ? 'warning.main' : 'text.secondary'}
                  sx={{ display: 'block', mt: -1.5 }}
                >
                  {stateOutsideProgramme
                    ? `${selectedState.label} isn't one of the states ${draft.programme} runs in — pick one of them, or leave empty for all states.`
                    : `Showing the ${programmeStateIds.size} ${programmeStateIds.size === 1 ? 'state' : 'states'} ${draft.programme} runs in. Leave empty for all of them.`}
                </Typography>
              ) : null}
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Financial year *"
                // Only a value that's in the list, so MUI doesn't warn while the master loads.
                value={selectedFy ? draft.financialYear : ''}
                onChange={set('financialYear')}
                disabled={fyMaster.isPending}
                error={Boolean(shown.header.financialYear || fyError)}
                helperText={shown.header.financialYear || fyError || (fyMaster.isPending ? 'Loading financial years…' : ' ')}
              >
                {fyOptions.map((fy) => (
                  <MenuItem key={fy.id} value={fy.label}>
                    {fy.code}
                    <Box component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: 12 }}>
                      · {FINANCIAL_YEAR_STATUS_LABEL[fy.status] || fy.status}
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField fullWidth label="Budget owner" value={draft.owner} onChange={set('owner')} helperText=" " />
            </Grid>
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                minRows={2}
                label="Notes"
                placeholder="Assumptions, funding source or anything the approver should know"
                value={draft.notes}
                onChange={set('notes')}
              />
            </Grid>
          </Grid>
        </FormSection>

        <FormSection
          step={3}
          title="Budget lines"
          subtitle="One line per cost item — choose its category and book, then phase the amount across Q1–Q4."
          error={shown.form}
        >
          <BudgetLineEditor lines={draft.lines} errors={shown.lines} onChange={(lines) => setDraft((d) => ({ ...d, lines }))} />
        </FormSection>

        {showErrors && !isBudgetValid(errors) ? (
          <Alert severity="error">Fix the highlighted fields before saving.</Alert>
        ) : null}

        <Stack direction="row" spacing={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={() => navigate(backTo)}>
            Cancel
          </Button>
          <Button variant="outlined" onClick={() => save(false)} disabled={saveBudget.isPending}>
            Save as draft
          </Button>
          <Button variant="contained" onClick={() => save(true)} disabled={saveBudget.isPending}>
            {saveBudget.isPending ? 'Saving…' : 'Save & submit for approval'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

/** A numbered form section: step badge, title and one-line hint above its content. */
function FormSection({ step, title, subtitle, error, children }) {
  return (
    <Card component="section" aria-labelledby={`budget-step-${step}`}>
      <CardContent sx={{ p: { xs: 2, sm: 3 }, '&:last-child': { pb: { xs: 2, sm: 3 } } }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2.5 }}>
          <Box
            aria-hidden
            sx={{
              width: 28,
              height: 28,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              fontWeight: 700,
              fontSize: 13,
              mt: 0.25,
            }}
          >
            {step}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography id={`budget-step-${step}`} variant="h6" component="h2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </Typography>
            {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
          </Box>
        </Stack>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        {children}
      </CardContent>
    </Card>
  );
}

/** Create (/budgets/new) and edit (/budgets/:id/edit) a budget — loads the budget first when editing. */
export function BudgetFormPage() {
  const { id } = useParams();
  const budgetQuery = useBudget(id);

  if (id && budgetQuery.isPending) return <LoadingState label="Loading budget…" />;
  if (id && budgetQuery.isError) {
    return <ErrorState error={budgetQuery.error} onRetry={budgetQuery.refetch} />;
  }
  // Keyed so switching between budgets (or to /new) starts a fresh form.
  return <BudgetForm key={id || 'new'} existing={id ? budgetQuery.data : null} />;
}
