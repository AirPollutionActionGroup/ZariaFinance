import { useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { Controller, useFieldArray, useWatch } from 'react-hook-form';
import { RhfTextField } from '../../../shared/components/index.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { CriterionFields } from './CriterionFields.jsx';
import { CURRENCY_SYMBOL, formatForeign, inrFromForeign } from './ForeignContributionFields.jsx';
import { criterionTypeLabel, emptyCriterion } from '../mappers/disbursementMapper.js';

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };

/** Designation id → its display name, for the criterion tooltip. */
function roleName(options, id) {
  return options.find((o) => String(o.value) === String(id))?.label || '';
}

/** Criteria the system checks itself (signing, % spent) read green; the rest are neutral. */
const SYSTEM_CRITERIA = ['UTILISATION_THRESHOLD', 'ON_SIGNING'];

/** One release criterion as a small chip; the details (who verifies, reminders) sit in its tooltip. */
function CriterionChip({ c, verificationRoleOptions, responsibleRoleOptions }) {
  const sys = SYSTEM_CRITERIA.includes(c.criterionType);
  const detail = c.milestoneName || (c.utilisationPercent ? `${c.utilisationPercent}% spent` : '');
  const tip = [
    c.verificationRoleId ? `Verified by ${roleName(verificationRoleOptions, c.verificationRoleId)}` : null,
    c.utilisationPercent ? `${c.utilisationPercent}% of ${c.triggerBasis || 'the previous tranche'}` : null,
    c.hasReminder && c.reminder?.reminderLeadDays
      ? `Reminder ${c.reminder.reminderLeadDays} days before to ${roleName(responsibleRoleOptions, c.reminder.responsibleRoleId) || 'the responsible person'}${c.reminder.escalateToDeputy ? ' (escalates)' : ''}`
      : null,
    c.met ? 'Met' : null,
  ].filter(Boolean).join(' · ');
  const chip = (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.25,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.6,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        bgcolor: sys ? 'var(--ok-bg)' : 'var(--card2)',
        color: sys ? 'var(--ok)' : 'text.primary',
        border: '1px solid',
        borderColor: sys ? 'transparent' : 'var(--line)',
      }}
    >
      {c.met ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : null}
      {c.criterionType ? criterionTypeLabel(c.criterionType) : 'Condition not set'}
      {detail ? <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>· {detail}</Box> : null}
    </Box>
  );
  return tip ? <Tooltip title={tip} describeChild>{chip}</Tooltip> : chip;
}

/** The tranche's number badge: its permanent T-number once saved, NEW before. */
function Badge({ tag, active }) {
  return (
    <Box
      sx={{
        minWidth: 34,
        height: 26,
        px: 0.75,
        flexShrink: 0,
        borderRadius: 1.5,
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'monospace',
        fontWeight: 700,
        fontSize: 12,
        bgcolor: active ? 'var(--ink)' : 'var(--card2)',
        color: active ? 'var(--card)' : 'text.primary',
        border: active ? 'none' : '1px solid var(--line)',
      }}
    >
      {tag}
    </Box>
  );
}

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bgcolor: 'var(--card2)', color: 'text.secondary', borderColor: 'var(--line)' },
    ok: { bgcolor: 'var(--ok-bg)', color: 'var(--ok)', borderColor: 'transparent' },
  };
  return (
    <Box component="span" sx={{ px: 0.75, borderRadius: 1, fontSize: 11, fontWeight: 600, lineHeight: 1.7, border: '1px solid', ...tones[tone] }}>
      {children}
    </Box>
  );
}

/**
 * One tranche of the payment schedule. Collapsed: a single row — number,
 * expected date, release criteria, amount and share, edit / delete.
 * Expanded: the editor for its amount, date, "final" flag and criteria.
 * Edits go straight into the form; they are saved with the whole record.
 */
export function TrancheCard({
  control,
  index,
  path,
  expanded,
  onToggleExpanded,
  onRemove,
  share = null,
  lumpSum = false,
  singleCriterion = false,
  verificationRoleOptions = [],
  responsibleRoleOptions = [],
  // FC book: { currency, rate } — the tranche is entered in the foreign
  // currency and its INR amount is derived (needs setValue).
  fx = null,
  setValue,
}) {
  const criteria = useFieldArray({ control, name: `${path}.criteria` });
  const tranche = useWatch({ control, name: path });
  const received = Boolean(tranche?.received);

  // Keep the INR amount = foreign amount × rate (also when the rate changes).
  const derivedInr = fx ? inrFromForeign(tranche?.fcAmount, fx.rate) : null;
  useEffect(() => {
    if (derivedInr != null && setValue && !received) {
      setValue(`${path}.amount`, String(derivedInr), { shouldValidate: true, shouldDirty: true });
    }
  }, [derivedInr, path, setValue, received]);
  const foreignLabel = fx && Number(tranche?.fcAmount) > 0 ? formatForeign(fx.currency, tranche.fcAmount) : null;

  // Saved tranches carry a permanent code (FP-2026-001-T2): the badge shows its
  // number, which needn't match the position. Unsaved ones get theirs on save.
  const code = tranche?.trancheCode || '';
  const tag = code ? code.slice(code.lastIndexOf('-') + 1) : 'NEW';
  const title = lumpSum ? 'Lump sum release' : `Tranche ${index + 1}`;
  const canRemove = !lumpSum && !received;
  const sharePct = share != null && Number.isFinite(share) ? Math.round(share * 100) : null;
  const amountNote = [foreignLabel, sharePct != null ? `${sharePct}%` : null].filter(Boolean).join(' · ');
  const date = tranche?.expectedReleaseDate ? formatDate(tranche.expectedReleaseDate) : 'Date not set';
  // Rows still waiting for a type (a fresh "Add criterion") don't count yet.
  const list = (tranche?.criteria || []).filter((c) => c?.criterionType);

  const amountBlock = (
    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
      <Typography sx={{ fontWeight: 700, fontSize: 15, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {formatInrExact(Number(tranche?.amount) || 0)}
      </Typography>
      {amountNote ? (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>{amountNote}</Typography>
      ) : null}
    </Box>
  );

  // ── Collapsed: one row.
  if (!expanded) {
    return (
      <Card
        variant="outlined"
        sx={{ mb: 1.25, borderRadius: 2, borderColor: 'var(--line)', transition: 'border-color .15s', '&:hover': { borderColor: 'text.disabled' } }}
      >
        <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1.5, columnGap: 2, rowGap: 1, flexWrap: { xs: 'wrap', md: 'nowrap' } }}>
          <Badge tag={tag} />
          <Box sx={{ width: { md: 150 }, flexShrink: 0, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14, color: tranche?.expectedReleaseDate ? 'text.primary' : 'text.disabled' }}>{date}</Typography>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
              <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: 'text.secondary' }} noWrap>
                {code || 'Not saved yet'}
              </Typography>
              {tranche?.isFinal ? <Pill>Final</Pill> : null}
              {received ? <Pill tone="ok">Received</Pill> : null}
            </Stack>
          </Box>
          <Box sx={{ flex: 1, minWidth: { xs: '100%', md: 0 }, order: { xs: 5, md: 0 }, display: 'flex', flexWrap: 'wrap', gap: 0.75, alignItems: 'center' }}>
            <Typography component="span" sx={{ fontSize: 12, color: 'text.secondary', mr: 0.25 }}>Released when</Typography>
            {list.length ? (
              list.map((c, i) => (
                <CriterionChip key={c.id ?? i} c={c} verificationRoleOptions={verificationRoleOptions} responsibleRoleOptions={responsibleRoleOptions} />
              ))
            ) : (
              <Typography component="span" sx={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>no condition yet</Typography>
            )}
          </Box>
          <Box sx={{ ml: { xs: 'auto', md: 0 } }}>{amountBlock}</Box>
          <Stack direction="row" spacing={0.25} sx={{ flexShrink: 0 }}>
            <Tooltip title="Edit tranche">
              <IconButton size="small" aria-label={`Edit ${title}`} onClick={onToggleExpanded}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {canRemove ? (
              <Tooltip title="Delete tranche">
                <IconButton size="small" aria-label={`Delete ${title}`} onClick={onRemove} sx={{ color: 'error.main' }}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            ) : null}
          </Stack>
        </Stack>
      </Card>
    );
  }

  // ── Expanded: the editor.
  const fieldSize = fx ? { xs: 12, sm: 6, md: 3 } : { xs: 12, sm: 4 };
  return (
    <Card
      variant="outlined"
      component="section"
      aria-label={`Editing ${title}`}
      sx={{ mb: 1.25, borderRadius: 2, borderColor: 'text.primary', borderWidth: 1.5, boxShadow: 'var(--shadow)' }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 2, py: 1.5, borderBottom: '1px solid var(--line)' }}>
        <Badge tag={tag} active />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Editing {title.toLowerCase()}</Typography>
          <Typography sx={{ fontSize: 11.5, fontFamily: 'monospace', color: 'text.secondary' }}>{code || 'Gets its code on save'}</Typography>
        </Box>
        {amountBlock}
      </Stack>

      <Box sx={{ px: 2, pt: 2.25, pb: 2 }}>
        {received ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            This tranche&apos;s receipt is recorded, so its amount is locked and it cannot be removed.
          </Alert>
        ) : null}

        <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
          {fx ? (
            <Grid size={fieldSize}>
              <RhfTextField
                name={`${path}.fcAmount`}
                control={control}
                label={`Amount in ${fx.currency || 'currency'}`}
                required
                type="number"
                disabled={received || lumpSum}
                helperText={fx.rate ? `× ₹${fx.rate} per ${fx.currency}` : 'Set the FX rate above'}
                slotProps={{
                  htmlInput: { min: 0, step: '0.01' },
                  input: { startAdornment: <InputAdornment position="start">{CURRENCY_SYMBOL[fx.currency] || fx.currency}</InputAdornment> },
                }}
              />
            </Grid>
          ) : null}
          <Grid size={fieldSize}>
            <RhfTextField
              name={`${path}.amount`}
              control={control}
              label={fx ? 'Amount (INR)' : 'Amount'}
              required
              type="number"
              disabled={received || lumpSum}
              helperText={fx ? (derivedInr != null ? 'Calculated from the foreign amount' : 'Enter the foreign amount') : undefined}
              slotProps={{
                htmlInput: { min: 0, step: '0.01', readOnly: derivedInr != null },
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  ...(derivedInr != null ? { sx: { bgcolor: 'var(--card2)' } } : null),
                },
              }}
            />
          </Grid>
          <Grid size={fieldSize}>
            <RhfTextField
              name={`${path}.expectedReleaseDate`}
              control={control}
              label="Expected release date"
              required
              type="date"
              disabled={lumpSum}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={fieldSize} sx={{ display: 'flex', alignItems: 'center', minHeight: 56 }}>
            <Controller
              name={`${path}.isFinal`}
              control={control}
              render={({ field }) => (
                <FormControlLabel
                  sx={{ ml: 0, '& .MuiFormControlLabel-label': { fontSize: 13.5, fontWeight: 600 } }}
                  control={<Switch size="small" checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} />}
                  label="Final tranche"
                />
              )}
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2.5, pt: 2, borderTop: '1px dashed var(--line)' }}>
          <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1.5 }}>
            <Typography sx={SMALL_CAPS}>Release criteria</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
              {criteria.fields.length > 1 ? 'all must be met before this tranche is released' : 'what must happen before this tranche is released'}
            </Typography>
          </Stack>
          <Stack spacing={1.5}>
            {criteria.fields.map((field, i) => (
              <CriterionFields
                key={field.id}
                control={control}
                path={`${path}.criteria.${i}`}
                index={i}
                canRemove={!singleCriterion && criteria.fields.length > 1}
                onRemove={() => criteria.remove(i)}
                verificationRoleOptions={verificationRoleOptions}
                responsibleRoleOptions={responsibleRoleOptions}
              />
            ))}
          </Stack>
          {!singleCriterion ? (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => criteria.append(emptyCriterion())}
              sx={{ mt: 1.5, borderStyle: 'dashed', fontWeight: 600 }}
            >
              Add criterion
            </Button>
          ) : null}
        </Box>
      </Box>

      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
        sx={{ px: 2, py: 1.25, borderTop: '1px solid var(--line)', bgcolor: 'var(--card2)', flexWrap: 'wrap', rowGap: 1 }}
      >
        <Button type="button" variant="contained" size="small" startIcon={<CheckRoundedIcon />} onClick={onToggleExpanded}>
          Done
        </Button>
        <Typography sx={{ fontSize: 12, color: 'text.secondary', flex: 1, minWidth: 180 }}>
          Kept in the form — saved with the whole record.
        </Typography>
        {canRemove ? (
          <Button type="button" size="small" color="error" startIcon={<DeleteOutlineIcon />} onClick={onRemove}>
            Remove tranche
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}
