import { useEffect, useRef } from 'react';
import { Box, Grid, IconButton, InputAdornment, Stack, TextField, Tooltip, Typography } from '@mui/material';
import CurrencyExchangeIcon from '@mui/icons-material/CurrencyExchange';
import UndoIcon from '@mui/icons-material/Undo';
import { Controller, useWatch } from 'react-hook-form';
import { RhfSelect } from '../../../shared/components/index.js';
import { formatDate } from '../../../lib/format/date.js';
import { useFxRate } from '../hooks/useFxRate.js';
import { CURRENCY_SYMBOL, FC_CURRENCIES, inrFromForeign } from '../lib/foreignContribution.js';

// Re-exported so existing imports from this component keep working.
export {
  CURRENCY_SYMBOL,
  FC_CURRENCIES,
  foreignContributionDefaults,
  formatForeign,
  inrFromForeign,
  todayIso,
} from '../lib/foreignContribution.js';

const CURRENCY_OPTIONS = FC_CURRENCIES.map((c) => ({ value: c, label: `${c} · ${CURRENCY_SYMBOL[c]}` }));

/** FxRateResponse.source → what the user sees under the FX rate. */
const SOURCE_LABEL = {
  FBIL: 'RBI/FBIL reference rate',
  ECB: 'ECB reference rate',
  MANUAL: 'Saved rate',
  SEED: 'Placeholder rate (not live)',
};

/** Plain number field bound to the form; keeps the raw string so typing isn't fought. */
function NumberField({ name, control, label, adornment, endAdornment = null, helperText, helperWarn = false, step = 'any' }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field, fieldState }) => (
        <TextField
          type="number"
          label={label}
          required
          fullWidth
          value={field.value ?? ''}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message || helperText}
          slotProps={{
            formHelperText: helperWarn && !fieldState.error ? { sx: { color: 'var(--warn)' } } : undefined,
            htmlInput: { min: 0, step },
            input: {
              ...(adornment
                ? {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ fontWeight: 700, color: 'text.primary' }}>
                        {adornment}
                      </InputAdornment>
                    ),
                  }
                : null),
              ...(endAdornment ? { endAdornment: <InputAdornment position="end">{endAdornment}</InputAdornment> } : null),
              sx: { fontVariantNumeric: 'tabular-nums' },
            },
          }}
        />
      )}
    />
  );
}

/**
 * Foreign contribution (FC book): the donor commits in a foreign currency.
 * The FX rate is looked up through the backend (GET /api/v1/fx-rates), which
 * asks Frankfurter for the RBI/FBIL reference rate (USD, EUR, GBP, JPY) or the
 * ECB rate (other currencies / fallback) for the chosen date, and can be
 * overridden. The hint always shows the rate's source and date. The INR
 * "Total amount committed" is then amount × rate, written back into the form.
 *
 * The currency, foreign amount, rate, rate date and rate source are saved on
 * the commitment alongside the INR total (donor_disbursement_rule).
 */
export function ForeignContributionFields({ control, setValue }) {
  const currency = useWatch({ control, name: 'fcCurrency' });
  const amount = useWatch({ control, name: 'fcAmount' });
  const rateDate = useWatch({ control, name: 'fcRateDate' });
  const rate = useWatch({ control, name: 'fcRate' });

  const fxQuery = useFxRate(currency, rateDate);
  const reference = fxQuery.data?.rateToInr ?? null;

  // Auto-fill the reference rate whenever currency/date change — but only the
  // first time for each lookup, so a rate the user typed is never overwritten.
  // A record opened for editing already has its saved rate: count that lookup
  // as done, so the saved rate isn't replaced by the live one.
  const appliedLookup = useRef(rate ? `${currency}|${rateDate}` : null);
  useEffect(() => {
    const key = `${currency}|${rateDate}`;
    if (reference != null && appliedLookup.current !== key) {
      appliedLookup.current = key;
      setValue('fcRate', String(reference), { shouldValidate: true, shouldDirty: true });
    }
  }, [currency, rateDate, reference, setValue]);

  // Keep the INR total in step with amount × rate.
  const inr = inrFromForeign(amount, rate);
  useEffect(() => {
    if (inr != null) setValue('totalAmount', String(inr), { shouldValidate: true, shouldDirty: true });
  }, [inr, setValue]);

  const usingReference = reference != null && Number(rate) === Number(reference);

  // Record where the rate came from: the reference source when it's used as-is,
  // MANUAL once typed over. (Saved / placeholder table rows count as MANUAL.)
  const liveSource = fxQuery.data?.source;
  const rateSource = usingReference && (liveSource === 'FBIL' || liveSource === 'ECB') ? liveSource : 'MANUAL';
  const lookupSettled = !fxQuery.isFetching;
  // A saved rate keeps its saved source until the rate, currency or date is
  // changed — today's live rate differing from it doesn't make it "manual".
  const savedRate = useRef(rate ? { key: `${currency}|${rateDate}`, rate: Number(rate) } : null);
  useEffect(() => {
    const saved = savedRate.current;
    if (saved && saved.key === `${currency}|${rateDate}` && saved.rate === Number(rate)) return;
    savedRate.current = null;
    if (lookupSettled && Number(rate) > 0) setValue('fcRateSource', rateSource);
  }, [lookupSettled, rate, rateSource, currency, rateDate, setValue]);
  // Always say where the rate came from and which day it belongs to.
  const source = fxQuery.data?.source;
  const isPlaceholder = usingReference && source === 'SEED';
  let rateHint;
  if (fxQuery.isFetching) rateHint = 'Looking up the reference rate…';
  else if (reference == null && fxQuery.isFetched) rateHint = 'No reference rate for this date — enter it manually';
  else if (usingReference) {
    const sourceLabel = SOURCE_LABEL[source] || 'Reference rate';
    const day = fxQuery.data.rateDate ? ` · ${formatDate(fxQuery.data.rateDate)}` : '';
    rateHint = `${sourceLabel}${day}${fxQuery.data.stale ? ' (latest available)' : ''}`;
  } else {
    // Rate typed over: keep the live figure in view so it's clear what undo restores.
    rateHint = reference != null ? `Entered manually · live rate ₹${Number(reference)}` : 'Entered manually';
  }

  // Undo a manual change: put the live (reference) rate back.
  const canRestore = reference != null && !usingReference && !fxQuery.isFetching;
  const restoreLiveRate = () =>
    setValue('fcRate', String(reference), { shouldValidate: true, shouldDirty: true });

  return (
    <Box sx={{ mb: 2.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ px: 2, py: 1.25, alignItems: 'center', bgcolor: 'var(--card2)', borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <CurrencyExchangeIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Foreign contribution · FC book
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This donor gives in a foreign currency. The INR total is calculated as amount × FX rate.
          </Typography>
        </Box>
      </Stack>

      <Grid container spacing={2} sx={{ p: 2 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <RhfSelect name="fcCurrency" control={control} label="Currency" options={CURRENCY_OPTIONS} required />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <NumberField
            name="fcAmount"
            control={control}
            label={`Amount in ${currency || 'currency'}`}
            adornment={CURRENCY_SYMBOL[currency]}
            helperText="As stated in the agreement"
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Controller
            name="fcRateDate"
            control={control}
            render={({ field, fieldState }) => (
              <TextField
                type="date"
                label="Rate date"
                required
                fullWidth
                value={field.value ?? ''}
                onChange={(e) => field.onChange(e.target.value)}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message || 'Date the rate is locked on'}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            )}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <NumberField
            name="fcRate"
            control={control}
            label={`FX rate (₹ per ${currency || 'unit'})`}
            adornment="₹"
            helperText={rateHint}
            helperWarn={isPlaceholder}
            endAdornment={
              canRestore ? (
                <Tooltip title={`Undo — use the live rate ₹${Number(reference)}`}>
                  <IconButton
                    size="small"
                    edge="end"
                    onClick={restoreLiveRate}
                    aria-label="Use the live rate"
                    sx={{ color: 'var(--ok)', '&:hover': { bgcolor: 'var(--ok-bg)' } }}
                  >
                    <UndoIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null
            }
            step="0.0001"
          />
        </Grid>
      </Grid>
    </Box>
  );
}
