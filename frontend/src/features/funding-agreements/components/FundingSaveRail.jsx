/**
 * Right-hand rail of the funding form on wide screens: jump links to the
 * three steps with their state, a live summary of what will be saved, the
 * optional reason for the change (when editing) and the Save / Cancel buttons
 * — always in view while scrolling the long form.
 */
import { Box, Button, Card, Stack, TextField, Typography } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import SaveIcon from '@mui/icons-material/Save';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };

const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/** One step link: number / tick, label and its state. */
function StepLink({ index, step }) {
  const done = step.status === 'done';
  const skipped = step.status === 'skipped';
  return (
    <Box
      component="button"
      type="button"
      onClick={() => jumpTo(step.id)}
      sx={{
        all: 'unset',
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1,
        py: 0.75,
        borderRadius: 1.5,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'var(--card2)' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
      }}
    >
      <Box
        sx={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 700,
          bgcolor: done ? 'var(--ok)' : 'transparent',
          color: done ? 'var(--card)' : 'text.secondary',
          border: done ? 'none' : skipped ? '1px dashed var(--line)' : '2px solid var(--line)',
        }}
      >
        {done ? <CheckRoundedIcon sx={{ fontSize: 14 }} /> : index + 1}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }}>{step.title}</Typography>
        <Typography sx={{ fontSize: 12, color: done ? 'var(--ok)' : 'text.secondary', lineHeight: 1.3 }}>
          {done ? 'Complete' : skipped ? 'Skipped — add later' : step.hint}
        </Typography>
      </Box>
    </Box>
  );
}

function Fact({ label, value, mono = false }) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1.5} sx={{ py: 0.6, fontSize: 13 }}>
      <Box sx={{ color: 'text.secondary', flexShrink: 0 }}>{label}</Box>
      <Box
        sx={{
          fontWeight: 600,
          textAlign: 'right',
          minWidth: 0,
          overflowWrap: 'anywhere',
          fontFamily: mono ? 'monospace' : undefined,
          color: value ? 'text.primary' : 'text.disabled',
        }}
      >
        {value || '—'}
      </Box>
    </Stack>
  );
}

export function FundingSaveRail({
  steps,
  facts,
  isEdit,
  changeNote,
  onChangeNote,
  lastChange,
  problemCount,
  saving,
  saveLabel,
  onCancel,
}) {
  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Box sx={{ px: 1.5, pt: 1.75, pb: 1 }}>
        <Typography sx={{ ...SMALL_CAPS, px: 1, mb: 0.5 }}>Sections</Typography>
        <Stack component="nav" aria-label="Form sections" spacing={0.25}>
          {steps.map((step, i) => (
            <StepLink key={step.id} index={i} step={step} />
          ))}
        </Stack>
      </Box>

      <Box sx={{ px: 2.5, py: 1.5, borderTop: '1px solid var(--line)' }}>
        <Typography sx={{ ...SMALL_CAPS, mb: 0.5 }}>Summary</Typography>
        {facts.map((f) => (
          <Fact key={f.label} {...f} />
        ))}
      </Box>

      <Box sx={{ px: 2.5, py: 2, borderTop: '1px solid var(--line)', bgcolor: 'var(--card2)' }}>
        {problemCount ? (
          <Box
            component="button"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            sx={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5, fontSize: 13, fontWeight: 600, color: 'error.main' }}
          >
            <ErrorOutlineRoundedIcon sx={{ fontSize: 18 }} />
            {problemCount === 1 ? '1 problem to fix' : `${problemCount} problems to fix`}
          </Box>
        ) : null}
        {isEdit ? (
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={2}
            label="Reason for change (optional)"
            value={changeNote}
            onChange={(e) => onChangeNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 1000 } }}
            sx={{ mb: 1.5, bgcolor: 'var(--card)' }}
          />
        ) : null}
        <Button type="submit" variant="contained" fullWidth startIcon={<SaveIcon />} disabled={saving}>
          {saving ? 'Saving…' : saveLabel}
        </Button>
        <Button color="inherit" fullWidth onClick={onCancel} disabled={saving} sx={{ mt: 0.75 }}>
          Cancel
        </Button>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1, textAlign: 'center' }}>
          {lastChange}
        </Typography>
      </Box>
    </Card>
  );
}
