/**
 * The terms of a funding record, as read-only sections: the payment schedule,
 * the spending rules, and the things worth checking ("issues"). Moved here from
 * the old Fund Profile detail page (/fund-profiles/:id), which was removed —
 * Funding Agreements (/funding/:id) is now the one place these are shown.
 */
import { Box, Card, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CurrencyExchangeRoundedIcon from '@mui/icons-material/CurrencyExchangeRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import PieChartOutlineOutlinedIcon from '@mui/icons-material/PieChartOutlineOutlined';
import { formatDate } from '../../../lib/format/date.js';
import { formatInr, formatInrExact } from '../../../lib/format/currency.js';
import { pct } from '../../credit-notes/components/NoteLayout.jsx';
import { FUND_CLASS_SHORT } from '../../donor-management/constants.js';
import { StatusChip } from '../../../shared/components/index.js';
import { relativeDay, trancheStatus } from '../lib/trancheStatus.js';

/* ---------- vocabulary ---------- */

/** Restriction classes, strictest first, in plain words. Colours are theme tokens (light + dark). */
const CLASSES = [
  { code: 'A', name: 'Fully restricted', short: 'Locked to one project & budget', fg: 'var(--err)', bg: 'var(--err-bg)' },
  { code: 'B', name: 'Flexible', short: 'Can move, with an explanation', fg: 'var(--warn)', bg: 'var(--warn-bg)' },
  { code: 'C', name: 'Free to use', short: 'Any programme or running cost', fg: 'var(--ok)', bg: 'var(--ok-bg)' },
];
const CLASS_BY_CODE = Object.fromEntries(CLASSES.map((c) => [c.code, c]));

/* ---------- helpers ---------- */

const classOf = (profile) => FUND_CLASS_SHORT[profile.fundClass] || null;

const committedOf = (profile) =>
  profile.disbursementRules.reduce((sum, rule) => sum + (Number(rule.totalAmount) || 0), 0);

function programmeLabel(profile) {
  if (!profile.programmeName) return null;
  if (profile.parentProgrammeName && profile.parentProgrammeName !== profile.programmeName) {
    return `${profile.parentProgrammeName} › ${profile.programmeName}`;
  }
  return profile.programmeName;
}

const isLumpSum = (rule) => rule.disbursementType === 'LUMP_SUM' || (rule.trancheCriteria || []).length <= 1;

/** The rule's instalments as a uniform list (a lump sum becomes one instalment). */
export function instalmentsOf(rule) {
  const tranches = rule.trancheCriteria || [];
  if (isLumpSum(rule)) {
    return [
      {
        ...(tranches[0] || {}),
        amountCriteria: rule.totalAmount,
        expectedReleaseDate: rule.receivingDate || tranches[0]?.expectedReleaseDate,
        isFinalTranche: true,
      },
    ];
  }
  return tranches;
}

/** A release gate as a short chip label, e.g. "Fixed date · 29 Dec 2026". */
function criterionChip(c) {
  const label = c.releaseCriteriaLabel || c.releaseCriteria || 'Other condition';
  const detail =
    c.milestoneName ||
    (c.releaseDate && formatDate(c.releaseDate)) ||
    (c.utilisationPercentage != null && `${c.utilisationPercentage}% spent`) ||
    (c.targetDate && `by ${formatDate(c.targetDate)}`);
  return detail ? `${label} · ${detail}` : label;
}

function criterionTooltip(c) {
  return [
    c.description,
    (c.verificationSignOffRoleLabel || c.otherVerificationSignOffRole) &&
      `Signed off by ${c.verificationSignOffRoleLabel || c.otherVerificationSignOffRole}`,
    c.remindSomeone &&
      `Reminder${c.reminderLeadTime ? ` ${c.reminderLeadTime} days before` : ''} to ${c.responsibleRoleLabel || c.otherResponsibleRole || 'the responsible person'}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function movementRule(profile) {
  if (!profile.movementAllowed) {
    return { answer: 'Not allowed', detail: 'Spend exactly as budgeted', fg: 'var(--err)', bg: 'var(--err-bg)' };
  }
  if (profile.explanationRequired) {
    return { answer: 'Allowed, with a reason', detail: 'Each move needs a written reason', fg: 'var(--warn)', bg: 'var(--warn-bg)' };
  }
  return { answer: 'Allowed freely', detail: 'No approval or reason needed', fg: 'var(--ok)', bg: 'var(--ok-bg)' };
}

/** Settings that contradict each other or are missing — surfaced so someone fixes them. */
export function findIssues(profile) {
  const code = classOf(profile);
  const issues = [];
  if (!code) issues.push('No restriction class is set, so it is unclear how tightly this money is controlled.');
  if (code === 'A' && profile.fundMode === 'UNRESTRICTED') {
    issues.push('Class A (fully restricted), but the fund mode is set to Unrestricted.');
  }
  if ((code === 'B' || code === 'C') && profile.fundMode === 'RESTRICTED') {
    issues.push(`Class ${code} (${CLASS_BY_CODE[code].name.toLowerCase()}), but the fund mode is set to Restricted.`);
  }
  if (code === 'A' && profile.movementAllowed) {
    issues.push('Class A money should stay on its budget lines, but moving it is allowed.');
  }
  if (code === 'B' && !profile.movementAllowed) {
    issues.push('Class B money is meant to move between budget lines, but movement is switched off.');
  }
  if (code === 'B' && profile.movementAllowed && !profile.explanationRequired) {
    issues.push('Class B moves need a written explanation, but “explanation required” is off.');
  }
  if (code === 'C' && !profile.movementAllowed) {
    issues.push('Class C money can be used freely, but moving it between budget lines is switched off.');
  }
  if (!profile.disbursementRules.length) {
    issues.push('No payment schedule, so the committed amount and dates are unknown.');
  }
  profile.disbursementRules.forEach((rule) => {
    (rule.trancheCriteria || []).forEach((tranche, index) => {
      (tranche.criteria || []).forEach((c) => {
        if (c.releaseDate && tranche.expectedReleaseDate && c.releaseDate !== tranche.expectedReleaseDate) {
          issues.push(
            `Instalment ${index + 1} is expected on ${formatDate(tranche.expectedReleaseDate)}, but its fixed release date is ${formatDate(c.releaseDate)}.`,
          );
        }
      });
    });
    if (rule.balanced === false && Number(rule.unallocatedAmount)) {
      issues.push(`${formatInr(rule.unallocatedAmount)} of the committed amount is not assigned to any instalment.`);
    }
  });
  return issues;
}

/* ---------- small building blocks ---------- */

function Pill({ fg, bg, children, icon: Icon }) {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1.1,
        py: 0.35,
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        color: fg,
        bgcolor: bg,
        whiteSpace: 'nowrap',
      }}
    >
      {Icon ? <Icon sx={{ fontSize: 15 }} /> : null}
      {children}
    </Box>
  );
}

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };

/** Section title with an optional line of context on the right. */
function SectionTitle({ title, aside }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1.25, gap: 2, flexWrap: 'wrap' }}>
      <Typography variant="h6" component="h2" sx={{ fontSize: 18 }}>
        {title}
      </Typography>
      {aside ? (
        <Typography variant="body2" color="text.secondary" component="div">
          {aside}
        </Typography>
      ) : null}
    </Stack>
  );
}

/* ---------- payment schedule ---------- */

/** One condition chip; who signs it off and any reminder sit in its tooltip. */
function ConditionChip({ c }) {
  const tip = criterionTooltip(c);
  const chip = <Chip size="small" variant="outlined" label={criterionChip(c)} sx={{ maxWidth: '100%' }} />;
  return tip ? <Tooltip title={tip} describeChild>{chip}</Tooltip> : chip;
}

/** Marker on the timeline: number, tick once received, red ring when overdue. */
function TimelineDot({ index, status }) {
  const received = status.key === 'received';
  const color = { received: 'var(--ok)', partial: 'var(--warn)', overdue: 'var(--err)', due: 'var(--info)' }[status.key] || 'var(--muted)';
  return (
    <Box
      sx={{
        width: 26,
        height: 26,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        fontSize: 12,
        fontWeight: 700,
        border: '2px solid',
        borderColor: color,
        bgcolor: received ? color : 'var(--card)',
        color: received ? 'var(--card)' : color,
        position: 'relative',
        zIndex: 1,
      }}
    >
      {received ? <CheckRoundedIcon sx={{ fontSize: 15 }} /> : index + 1}
    </Box>
  );
}

/** One instalment on the timeline: when, how much, on what condition, and where it stands. */
function InstalmentRow({ index, count, instalment, total, got, hasAgreement, last, fx }) {
  const expected = Number(instalment.amountCriteria) || 0;
  const share = pct(expected, Number(total) || 0);
  const status = trancheStatus({ expected, received: got?.amount || 0, expectedDate: instalment.expectedReleaseDate, hasAgreement });
  const criteria = instalment.criteria || [];
  const when = instalment.expectedReleaseDate ? relativeDay(instalment.expectedReleaseDate) : null;
  const foreign = fx && instalment.foreignAmount != null ? `${fx} ${Number(instalment.foreignAmount).toLocaleString('en-IN')}` : null;

  return (
    <Box component="li" sx={{ display: 'flex', gap: 2, position: 'relative' }}>
      {/* the line linking this marker to the next */}
      {last ? null : <Box aria-hidden sx={{ position: 'absolute', left: 12, top: 30, bottom: -6, width: 2, bgcolor: 'var(--line)' }} />}
      <Box sx={{ pt: 1.6 }}>
        <TimelineDot index={index} status={status} />
      </Box>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr auto', md: '190px 170px minmax(0, 1fr) auto' },
          alignItems: 'center',
          columnGap: 2.5,
          rowGap: 1,
          py: 1.5,
          borderBottom: last ? 'none' : '1px solid var(--line2)',
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 600, fontSize: 14.5, whiteSpace: 'nowrap' }}>
            {instalment.expectedReleaseDate ? formatDate(instalment.expectedReleaseDate) : 'Date not set'}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: { md: 'nowrap' } }}>
            {when}
            {instalment.trancheCode ? (
              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: 11.5, ml: { xs: 0, md: when ? 0.75 : 0 }, display: { xs: 'block', md: 'inline' } }}>
                {instalment.trancheCode}
              </Box>
            ) : null}
          </Typography>
        </Box>

        <Box sx={{ textAlign: { xs: 'right', md: 'left' } }}>
          <Typography sx={{ fontWeight: 700, fontSize: 15.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {formatInrExact(expected)}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {[foreign, count > 1 ? `${share}% of total` : 'Full amount'].filter(Boolean).join(' · ')}
          </Typography>
        </Box>

        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', gridColumn: { xs: '1 / -1', md: 'auto' }, minWidth: 0 }}>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>Released when</Typography>
          {criteria.length ? (
            criteria.map((c, i) => <ConditionChip key={c.id ?? i} c={c} />)
          ) : (
            <Typography sx={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>no condition recorded</Typography>
          )}
          {instalment.isFinalTranche && count > 1 ? <Pill fg="var(--muted)" bg="var(--card2)">Final</Pill> : null}
        </Stack>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          justifyContent="flex-end"
          sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, minWidth: { md: 190 } }}
        >
          <Box sx={{ textAlign: 'right' }}>
            <StatusChip label={status.label} tone={status.tone} />
            {got?.amount > 0 ? (
              <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25, whiteSpace: 'nowrap' }}>
                {formatInrExact(got.amount)} in{got.date ? ` · ${formatDate(got.date)}` : ''}
              </Typography>
            ) : null}
          </Box>
          {instalment.id != null ? (
            <Tooltip title="Open in Inflow Budget">
              <IconButton
                size="small"
                component={RouterLink}
                to={`/inflow-budget/${instalment.id}`}
                aria-label={`Open instalment ${index + 1} in Inflow Budget`}
              >
                <OpenInNewRoundedIcon sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
}

/** Committed vs received, one segment per instalment, each filled as far as it has come in. */
function ReceiptBar({ instalments, receivedByTranche, total }) {
  if (!instalments.length || !(Number(total) > 0)) return null;
  const gotTotal = instalments.reduce((s, t) => s + (receivedByTranche[String(t.id)]?.amount || 0), 0);
  const due = Math.max(0, Number(total) - gotTotal);
  return (
    <Box sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, borderBottom: '1px solid var(--line)', bgcolor: 'var(--card2)' }}>
      <Stack direction="row" spacing={3} sx={{ mb: 1, flexWrap: 'wrap', rowGap: 0.5 }}>
        <Legend color="var(--ok)" label="Received" value={formatInrExact(gotTotal)} />
        <Legend color="var(--line)" label="Still to come" value={formatInrExact(due)} />
      </Stack>
      <Stack direction="row" sx={{ height: 10, gap: '3px' }} role="img" aria-label={`Received ${formatInrExact(gotTotal)} of ${formatInrExact(total)}`}>
        {instalments.map((t, i) => {
          const expected = Number(t.amountCriteria) || 0;
          const got = Math.min(receivedByTranche[String(t.id)]?.amount || 0, expected);
          return (
            <Tooltip key={t.id ?? i} title={`Instalment ${i + 1}: ${formatInrExact(got)} of ${formatInrExact(expected)} received`}>
              <Box sx={{ flexGrow: expected || 0.0001, flexBasis: 0, borderRadius: 1, bgcolor: 'var(--line)', overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: expected ? `${(got / expected) * 100}%` : 0, bgcolor: 'var(--ok)' }} />
              </Box>
            </Tooltip>
          );
        })}
      </Stack>
    </Box>
  );
}

function Legend({ color, label, value }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="center">
      <Box sx={{ width: 10, height: 10, borderRadius: 0.5, bgcolor: color }} />
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
        {label} <Box component="strong" sx={{ color: 'text.primary' }}>{value}</Box>
      </Typography>
    </Stack>
  );
}

export function PaymentSchedule({ profile, receivedByTranche = {}, hasAgreement = true }) {
  const rule = profile.disbursementRules[0];
  const instalments = rule ? instalmentsOf(rule) : [];
  const lump = rule ? isLumpSum(rule) : false;
  const fx = rule?.foreign && rule.currency ? rule.currency : null;
  const kind = rule ? (lump ? 'One payment' : `${instalments.length} tranches${instalments[0]?.frequencyLabel ? ` · ${instalments[0].frequencyLabel}` : ''}`) : null;

  return (
    <Box sx={{ mb: 4 }}>
      <SectionTitle
        title="Payment schedule"
        aside={
          rule ? (
            <>
              <Box component="strong" sx={{ color: 'text.primary' }}>{formatInrExact(rule.totalAmount)}</Box> · {kind}
            </>
          ) : null
        }
      />
      <Card sx={{ overflow: 'hidden' }}>
        {rule ? (
          <>
            {fx ? (
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                sx={{ px: { xs: 2, md: 2.5 }, py: 1.25, borderBottom: '1px solid var(--line)', flexWrap: 'wrap', rowGap: 0.5 }}
              >
                <CurrencyExchangeRoundedIcon sx={{ fontSize: 17, color: 'text.secondary' }} />
                <Typography sx={{ fontSize: 13 }}>
                  <strong>
                    {fx} {Number(rule.foreignAmount || 0).toLocaleString('en-IN')}
                  </strong>{' '}
                  at ₹{Number(rule.fxRate)} per {fx}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                  · {[rule.fxRateSourceLabel, rule.fxRateDate ? `rate of ${formatDate(rule.fxRateDate)}` : null].filter(Boolean).join(', ')}
                </Typography>
              </Stack>
            ) : null}
            {hasAgreement ? <ReceiptBar instalments={instalments} receivedByTranche={receivedByTranche} total={rule.totalAmount} /> : null}
            <Box component="ol" sx={{ listStyle: 'none', m: 0, px: { xs: 2, md: 2.5 }, py: 0.5 }}>
              {instalments.map((instalment, index) => (
                <InstalmentRow
                  key={instalment.id ?? index}
                  index={index}
                  count={instalments.length}
                  instalment={instalment}
                  total={rule.totalAmount}
                  got={receivedByTranche[String(instalment.id)]}
                  hasAgreement={hasAgreement}
                  last={index === instalments.length - 1}
                  fx={fx}
                />
              ))}
            </Box>
          </>
        ) : (
          <Typography color="text.secondary" sx={{ px: 2.5, py: 2.5 }}>
            No payment schedule has been added yet.
          </Typography>
        )}
      </Card>
    </Box>
  );
}

/* ---------- spending rules ---------- */

/** One rule as a tile: icon and question, the answer, and a short note under it. */
function RuleTile({ icon: Icon, label, note, warning, wide = false, children }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: '1px solid',
        borderColor: warning ? 'var(--warn)' : 'var(--line)',
        bgcolor: warning ? 'var(--warn-bg)' : 'var(--card)',
        gridColumn: wide ? { sm: '1 / -1' } : undefined,
        minWidth: 0,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Icon sx={{ fontSize: 17, color: 'text.secondary' }} />
        <Typography sx={SMALL_CAPS}>{label}</Typography>
      </Stack>
      <Box sx={{ minWidth: 0 }}>{children}</Box>
      {note ? <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mt: 0.75 }}>{note}</Typography> : null}
      {warning ? (
        <Stack direction="row" spacing={0.75} alignItems="flex-start" sx={{ mt: 1 }}>
          <WarningAmberRoundedIcon sx={{ fontSize: 16, color: 'var(--warn)', mt: '1px' }} />
          <Typography sx={{ fontSize: 12.5, color: 'var(--warn)', fontWeight: 600 }}>{warning}</Typography>
        </Stack>
      ) : null}
    </Box>
  );
}

const answerSx = { fontWeight: 600, fontSize: 15 };

/**
 * Geography rows grouped by state: "Maharashtra" for a whole state,
 * "Maharashtra · Mumbai, Pune" for a state narrowed to cities.
 */
function placesOf(geographies) {
  const byState = new Map();
  for (const g of geographies) {
    const entry = byState.get(g.stateId) || { stateId: g.stateId, stateName: g.stateName, cities: [] };
    if (g.cityName) entry.cities.push(g.cityName);
    byState.set(g.stateId, entry);
  }
  return [...byState.values()].map((e) => ({
    stateId: e.stateId,
    label: e.cities.length ? `${e.stateName} · ${e.cities.join(', ')}` : e.stateName,
  }));
}

/** What the class expects of budget-line movement — so a tile can flag a mismatch. */
function movementWarning(code, profile) {
  if (code === 'A' && profile.movementAllowed) return 'Class A money should stay on its budget lines.';
  if (code === 'B' && !profile.movementAllowed) return 'Class B money is meant to be movable (with a reason).';
  if (code === 'C' && !profile.movementAllowed) return 'Class C money is meant to move freely.';
  return null;
}

export function SpendingRules({ profile }) {
  const programme = programmeLabel(profile);
  const movement = movementRule(profile);
  const committed = committedOf(profile);
  // Only real caps count — a row without a percentage (e.g. "Not applicable") isn't a limit.
  const limits = profile.utilisationRules.filter((r) => r.limitPercentage != null);
  const code = classOf(profile);
  const cls = code ? CLASS_BY_CODE[code] : null;

  return (
    <Box sx={{ mb: 3 }}>
      <SectionTitle title="Spending rules" aside="What the money may be used for, where, and how freely" />

      <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
        <RuleTile icon={LockOutlinedIcon} label="Restriction" note={cls ? cls.short : 'Set a class so everyone knows how tightly this is controlled'}>
          {cls ? (
            <Pill fg={cls.fg} bg={cls.bg}>
              {profile.fundClassLabel || `Class ${cls.code} · ${cls.name}`}
            </Pill>
          ) : (
            <Typography sx={{ ...answerSx, color: 'var(--warn)' }}>Not set</Typography>
          )}
        </RuleTile>

        <RuleTile icon={CategoryOutlinedIcon} label="Programme" note={programme ? 'No other programme may use it' : 'Not tied to a programme'}>
          <Typography sx={answerSx}>{programme || 'Any programme'}</Typography>
        </RuleTile>

        <RuleTile
          icon={PlaceOutlinedIcon}
          label="Location"
          note={
            profile.geographies.length
              ? profile.geographies.some((g) => g.cityId != null)
                ? 'Only in these states / cities'
                : 'Only in these states'
              : 'No state restriction'
          }
        >
          {profile.geographies.length ? (
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {placesOf(profile.geographies).map((place) => (
                <Chip key={place.stateId} size="small" label={place.label} />
              ))}
            </Stack>
          ) : (
            <Typography sx={answerSx}>Anywhere</Typography>
          )}
        </RuleTile>

        <RuleTile icon={SwapHorizOutlinedIcon} label="Moving between budget lines" note={movement.detail} warning={movementWarning(code, profile)}>
          <Pill fg={movement.fg} bg={movement.bg}>
            {movement.answer}
          </Pill>
        </RuleTile>

        <RuleTile icon={EventRepeatOutlinedIcon} label="Reporting to the donor" note={profile.reportingFrequency ? 'How often a report is due' : 'No reporting schedule set'}>
          <Typography sx={answerSx}>{profile.reportingFrequencyLabel || profile.reportingFrequency || 'Not set'}</Typography>
        </RuleTile>

        <RuleTile
          icon={PieChartOutlineOutlinedIcon}
          label="Spending limits"
          note={limits.length ? 'Most of the fund a cost type may use' : 'No cost type is capped'}
        >
          {limits.length ? (
            <Stack spacing={1.25}>
              {limits.map((rule, index) => {
                const limit = rule.limitPercentage != null ? Number(rule.limitPercentage) : null;
                const name = rule.otherRuleType || rule.ruleTypeLabel || rule.ruleType;
                return (
                  <Tooltip key={rule.id ?? index} title={rule.description || ''} describeChild>
                    <Box>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                        <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{name}</Typography>
                        {limit != null ? (
                          <Typography sx={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                            up to <strong>{limit}%</strong>
                          </Typography>
                        ) : null}
                      </Stack>
                      {limit != null ? (
                        <>
                          <Box sx={{ mt: 0.5, height: 6, borderRadius: 3, bgcolor: 'var(--card2)', overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', width: `${Math.min(limit, 100)}%`, bgcolor: 'var(--warn)' }} />
                          </Box>
                          {committed ? (
                            <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.25 }}>
                              {formatInrExact((committed * limit) / 100)} of {formatInrExact(committed)}
                            </Typography>
                          ) : null}
                        </>
                      ) : null}
                    </Box>
                  </Tooltip>
                );
              })}
            </Stack>
          ) : (
            <Typography sx={answerSx}>No limits</Typography>
          )}
        </RuleTile>
      </Box>
    </Box>
  );
}
