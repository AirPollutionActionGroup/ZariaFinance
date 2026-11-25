import { useMemo, useState } from 'react';
import { Box, Button, Card, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import EastRoundedIcon from '@mui/icons-material/EastRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { EmptyState, ErrorState } from '../../../shared/components/index.js';
import { formatDate } from '../../../lib/format/date.js';
import { downloadCsv, toCsv } from '../../../lib/export/csv.js';

/** Each action: its marker icon and colour. */
const ACTION_STYLE = {
  CREATED: { icon: AddRoundedIcon, color: 'var(--info)' },
  AGREEMENT_ADDED: { icon: DescriptionOutlinedIcon, color: 'var(--info)' },
  UPDATED: { icon: EditOutlinedIcon, color: 'var(--ink)' },
  APPROVED: { icon: CheckRoundedIcon, color: 'var(--ok)' },
  ACTIVATED: { icon: PlayArrowRoundedIcon, color: 'var(--ok)' },
  RESUMED: { icon: PlayArrowRoundedIcon, color: 'var(--ok)' },
  ON_HOLD: { icon: PauseRoundedIcon, color: 'var(--warn)' },
  COMPLETED: { icon: TaskAltRoundedIcon, color: 'var(--info)' },
  CLOSED: { icon: BlockRoundedIcon, color: 'var(--err)' },
};
const STATUS_ACTIONS = ['APPROVED', 'ACTIVATED', 'RESUMED', 'ON_HOLD', 'COMPLETED', 'CLOSED'];

/** Status words → colour, for the "from → to" pills. */
function stageTone(label) {
  const l = String(label || '').toLowerCase();
  if (/approved|active|resumed/.test(l)) return { fg: 'var(--ok)', bg: 'var(--ok-bg)' };
  if (/hold|pending/.test(l)) return { fg: 'var(--warn)', bg: 'var(--warn-bg)' };
  if (/closed|cancel/.test(l)) return { fg: 'var(--err)', bg: 'var(--err-bg)' };
  if (/complete/.test(l)) return { fg: 'var(--info)', bg: 'var(--info-bg)' };
  return { fg: 'var(--muted)', bg: 'var(--card2)' };
}

/** Section filter: which change sections each choice covers. */
const FILTERS = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'terms', label: 'Terms', match: (s) => ['Terms', 'Geographies', 'Utilisation rules', 'Funding'].includes(s) },
  { key: 'money', label: 'Disbursement', match: (s) => s === 'Disbursement' || Boolean(s?.startsWith('Tranche')) },
  { key: 'agreement', label: 'Agreement', match: (s) => s === 'Agreement' },
  { key: 'status', label: 'Status', match: (s) => s === 'Status' },
];
const PAGE = 15;
const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };

const isBackfill = (e) => String(e.id).startsWith('start-');
const dayKey = (iso) => String(iso || '').slice(0, 10);
const timeOf = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase() : '';

/** "Today", "Yesterday" or the date — kept outside render (reads the clock). */
function dayLabel(key) {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === iso(today)) return `Today · ${formatDate(key)}`;
  if (key === iso(yesterday)) return `Yesterday · ${formatDate(key)}`;
  return formatDate(key);
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function StagePill({ children }) {
  const t = stageTone(children);
  return (
    <Box component="span" sx={{ px: 1, py: 0.15, borderRadius: 999, fontSize: 12, fontWeight: 600, color: t.fg, bgcolor: t.bg, whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  );
}

/** One "field: old → new" row; an added value shows no old side, a removed one says so. */
function ChangeRow({ change }) {
  const added = change.from == null && change.to != null;
  const removed = change.from != null && change.to == null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '180px minmax(0, 1fr)' },
        columnGap: 2,
        rowGap: 0.25,
        py: 0.75,
        '& + &': { borderTop: '1px solid var(--line2)' },
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {change.field}
      </Typography>
      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.25, minWidth: 0 }}>
        {added ? (
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: 'var(--ok)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Added
          </Typography>
        ) : (
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', textDecoration: removed ? 'none' : 'line-through', textDecorationColor: 'var(--err)', overflowWrap: 'anywhere' }}
          >
            {change.from ?? '—'}
          </Typography>
        )}
        {removed ? (
          <Typography component="span" sx={{ fontSize: 11, fontWeight: 700, color: 'var(--err)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Removed
          </Typography>
        ) : (
          <>
            {added ? null : <EastRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
            <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
              {change.to}
            </Typography>
          </>
        )}
      </Stack>
    </Box>
  );
}

/** One entry: time, marker, what happened, who, why, and the field-by-field changes. */
function Entry({ entry, last, sectionFilter }) {
  const style = ACTION_STYLE[entry.action] || { icon: EditOutlinedIcon, color: 'var(--muted)' };
  const Icon = style.icon;
  const changes = entry.changes.filter((c) => sectionFilter(c.section));
  const isStatus = STATUS_ACTIONS.includes(entry.action);
  const found = isStatus ? entry.changes.find((c) => c.section === 'Status') : null;
  // A lone "Approved" pill next to the "Approved" title says nothing — show pills only for a real move.
  const statusChange = found && (found.from || found.to !== entry.actionLabel) ? found : null;
  const backfill = isBackfill(entry);
  const showChanges = entry.action === 'UPDATED' && changes.length > 0;
  const bySection = changes.reduce((acc, c) => {
    (acc[c.section || 'Other'] ||= []).push(c);
    return acc;
  }, {});
  const sections = Object.keys(bySection);
  const headline =
    entry.action === 'UPDATED'
      ? `${changes.length} ${changes.length === 1 ? 'change' : 'changes'} · ${sections.join(', ')}`
      : entry.action === 'CREATED' || entry.action === 'AGREEMENT_ADDED'
        ? entry.changes[0]?.to
        : null;

  return (
    <Box component="li" sx={{ display: 'grid', gridTemplateColumns: { xs: '28px minmax(0, 1fr)', sm: '72px 28px minmax(0, 1fr)' }, columnGap: 1.75 }}>
      <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12, color: 'text.secondary', textAlign: 'right', pt: 0.6, whiteSpace: 'nowrap' }}>
        {timeOf(entry.changedAt)}
      </Typography>
      <Stack alignItems="center">
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: style.color,
            bgcolor: 'var(--card)',
            border: '2px solid',
            borderColor: style.color,
            flexShrink: 0,
          }}
        >
          <Icon sx={{ fontSize: 15 }} />
        </Box>
        {last ? null : <Box sx={{ flex: 1, width: 2, bgcolor: 'var(--line)', my: 0.5, minHeight: 12 }} />}
      </Stack>

      <Box sx={{ pb: last ? 0.5 : 2.5, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5, minHeight: 28 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{entry.actionLabel}</Typography>
          {statusChange ? (
            <Stack direction="row" spacing={0.75} alignItems="center">
              {statusChange.from ? (
                <>
                  <StagePill>{statusChange.from}</StagePill>
                  <EastRoundedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                </>
              ) : null}
              <StagePill>{statusChange.to}</StagePill>
            </Stack>
          ) : headline ? (
            <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
              {headline}
            </Typography>
          ) : null}
        </Stack>

        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.25 }}>
          {backfill ? (
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontStyle: 'italic' }}>
              From the record&apos;s data — before the change log started
            </Typography>
          ) : (
            <>
              <Box
                aria-hidden
                sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: 'var(--card2)', border: '1px solid var(--line)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}
              >
                {initials(entry.changedBy)}
              </Box>
              <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
                {entry.changedBy || 'Unknown user'}
                <Box component="span" sx={{ display: { sm: 'none' } }}> · {timeOf(entry.changedAt)}</Box>
              </Typography>
            </>
          )}
        </Stack>

        {entry.note && !backfill ? (
          <Box sx={{ mt: 1, pl: 1.5, py: 0.25, borderLeft: '3px solid var(--line)' }}>
            <Typography sx={{ ...SMALL_CAPS, fontSize: 10 }}>Reason</Typography>
            <Typography variant="body2">{entry.note}</Typography>
          </Box>
        ) : null}

        {showChanges ? (
          <Box sx={{ mt: 1.25, border: '1px solid var(--line)', borderRadius: 2, overflow: 'hidden' }}>
            {sections.map((section, i) => (
              <Box key={section} sx={{ px: 1.75, py: 0.75, borderTop: i ? '1px solid var(--line)' : 'none' }}>
                <Typography sx={{ ...SMALL_CAPS, fontSize: 10.5, mt: 0.5 }}>{section}</Typography>
                {bySection[section].map((c, k) => (
                  <ChangeRow key={`${c.field}-${k}`} change={c} />
                ))}
              </Box>
            ))}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

/** CSV of the log: one row per field change (status steps and starts are one row each). */
function exportHistory(entries, fileName) {
  const rows = entries.flatMap((e) =>
    (e.changes.length ? e.changes : [{}]).map((c) => ({ e, c })),
  );
  const csv = toCsv(
    [
      { header: 'Date', value: ({ e }) => dayKey(e.changedAt), asText: true },
      { header: 'Time', value: ({ e }) => timeOf(e.changedAt) },
      { header: 'Action', value: ({ e }) => e.actionLabel },
      { header: 'By', value: ({ e }) => (isBackfill(e) ? '(before the change log)' : e.changedBy || '') },
      { header: 'Reason', value: ({ e }) => (isBackfill(e) ? '' : e.note || '') },
      { header: 'Section', value: ({ c }) => c.section || '' },
      { header: 'Field', value: ({ c }) => c.field || '' },
      { header: 'From', value: ({ c }) => c.from ?? '' },
      { header: 'To', value: ({ c }) => c.to ?? '' },
    ],
    rows,
  );
  downloadCsv(fileName, csv);
}

/** The funding record's change history — every save and status step, grouped by day, newest first. */
export function FundingHistory({ query, exportName = 'change-history' }) {
  const [filter, setFilter] = useState('all');
  const [showAll, setShowAll] = useState(false);
  const all = useMemo(() => query.data || [], [query.data]);
  const match = FILTERS.find((f) => f.key === filter).match;
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((e) => f.key === 'all' || e.changes.some((c) => f.match(c.section))).length])),
    [all],
  );
  const entries = useMemo(
    () => all.filter((e) => filter === 'all' || e.changes.some((c) => match(c.section))),
    [all, filter, match],
  );
  const shown = showAll ? entries : entries.slice(0, PAGE);
  const days = useMemo(() => {
    const groups = [];
    for (const e of shown) {
      const key = dayKey(e.changedAt);
      if (groups.at(-1)?.key !== key) groups.push({ key, entries: [] });
      groups.at(-1).entries.push(e);
    }
    return groups;
  }, [shown]);

  const people = new Set(all.filter((e) => !isBackfill(e) && e.changedBy).map((e) => e.changedBy));
  const edits = all.filter((e) => e.action === 'UPDATED').length;
  const steps = all.filter((e) => STATUS_ACTIONS.includes(e.action)).length;
  const latest = all.find((e) => !isBackfill(e));

  return (
    <Card>
      <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid var(--line)' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} spacing={1.5}>
          <Box>
            <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
              Change history
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {all.length
                ? [
                    `${edits} ${edits === 1 ? 'edit' : 'edits'}`,
                    `${steps} status ${steps === 1 ? 'change' : 'changes'}`,
                    people.size ? `by ${people.size} ${people.size === 1 ? 'person' : 'people'}` : null,
                    latest ? `last ${formatDate(latest.changedAt)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Every save and status change on this record.'}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={filter}
              onChange={(_e, v) => {
                if (v) {
                  setFilter(v);
                  setShowAll(false);
                }
              }}
              aria-label="Show changes to"
              sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { px: 1.25, py: 0.35, textTransform: 'none', fontWeight: 600, fontSize: 12.5 } }}
            >
              {FILTERS.map((f) => (
                <ToggleButton key={f.key} value={f.key} disabled={f.key !== 'all' && !counts[f.key]}>
                  {f.label}
                  {counts[f.key] ? ` · ${counts[f.key]}` : ''}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <Tooltip title="Download this log as CSV">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FileDownloadOutlinedIcon />}
                  disabled={!entries.length}
                  onClick={() => exportHistory(entries, `${exportName}.csv`)}
                >
                  CSV
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      <Box sx={{ px: 2.5, py: 2 }}>
        {query.isPending ? (
          <Typography variant="body2" color="text.secondary">
            Loading history…
          </Typography>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : !entries.length ? (
          <EmptyState
            compact
            title={filter === 'all' ? 'No changes recorded yet' : 'No changes in this section'}
            description={filter === 'all' ? 'Edits and status changes will show here.' : 'Pick another section, or All.'}
          />
        ) : (
          <>
            {days.map((day, d) => (
              <Box key={day.key} component="section" aria-label={dayLabel(day.key)} sx={{ mt: d ? 2.5 : 0 }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
                  <Typography sx={{ ...SMALL_CAPS, color: 'text.primary', whiteSpace: 'nowrap' }}>{dayLabel(day.key)}</Typography>
                  <Box sx={{ flex: 1, height: '1px', bgcolor: 'var(--line)' }} />
                  <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'nowrap' }}>
                    {day.entries.length} {day.entries.length === 1 ? 'entry' : 'entries'}
                  </Typography>
                </Stack>
                <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {day.entries.map((e, i) => (
                    <Entry key={e.id} entry={e} last={i === day.entries.length - 1} sectionFilter={filter === 'all' ? () => true : match} />
                  ))}
                </Box>
              </Box>
            ))}
            {entries.length > PAGE ? (
              <Button size="small" onClick={() => setShowAll((v) => !v)} sx={{ mt: 2 }}>
                {showAll ? 'Show the latest only' : `Show all ${entries.length} entries`}
              </Button>
            ) : null}
          </>
        )}
      </Box>
    </Card>
  );
}
