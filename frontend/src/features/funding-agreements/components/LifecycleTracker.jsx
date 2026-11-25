import { Box, Stack, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import PauseIcon from '@mui/icons-material/Pause';
import { formatDate } from '../../../lib/format/date.js';

/**
 * Compact progress through the funding lifecycle, for the header's footer strip:
 *   Terms set → Agreement recorded → Approved → Completed
 * Each step is a small dot with its label and one caption beside it.
 * "On hold" isn't a step of its own — it marks the Approved step as paused.
 */
const STEPS = [
  { key: 'terms', label: 'Terms set' },
  { key: 'agreement', label: 'Agreement' },
  { key: 'approved', label: 'Approved' },
  { key: 'completed', label: 'Completed' },
];

/** How far along a stage key is (index of the last finished step). */
const REACHED = { terms: 0, pending: 1, approved: 2, onhold: 2, completed: 3 };

export function LifecycleTracker({ stage, profile, grant }) {
  const reached = REACHED[stage] ?? 0;
  const paused = stage === 'onhold';

  const captions = {
    terms: profile?.createdAt ? formatDate(profile.createdAt) : null,
    agreement: grant ? (grant.agreementDate ? `Signed ${formatDate(grant.agreementDate)}` : 'Recorded') : 'Next step',
    approved:
      grant?.isApproved === 1 && grant.approvalDate
        ? formatDate(grant.approvalDate)
        : paused
          ? 'On hold'
          : reached === 1
            ? 'Next step'
            : null,
    completed: grant?.endDate ? `${reached >= 3 ? 'Ended' : 'Ends'} ${formatDate(grant.endDate)}` : null,
  };

  return (
    <Stack
      component="ol"
      aria-label="Progress"
      direction="row"
      alignItems="center"
      sx={{ listStyle: 'none', m: 0, p: 0, flex: 1, minWidth: 0, flexWrap: { xs: 'wrap', lg: 'nowrap' }, columnGap: 1, rowGap: 1, py: 0.25 }}
    >
      {STEPS.map((step, index) => {
        const done = index <= reached;
        const isPaused = paused && index === reached;
        const isNext = index === reached + 1;
        const color = isPaused ? 'var(--warn)' : done ? 'var(--ok)' : isNext ? 'var(--info)' : 'var(--line)';
        const state = isPaused ? 'on hold' : done ? 'done' : isNext ? 'next' : 'to do';
        return (
          <Box component="li" key={step.key} sx={{ display: 'contents' }} aria-label={`${step.label}: ${state}`}>
            {index > 0 ? (
              <Box aria-hidden sx={{ flex: '1 1 16px', minWidth: 16, maxWidth: 56, height: 2, borderRadius: 1, bgcolor: index <= reached ? 'var(--ok)' : 'var(--line)' }} />
            ) : null}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  border: '2px solid',
                  borderColor: color,
                  bgcolor: done ? color : 'transparent',
                  color: done ? 'var(--card)' : color,
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {isPaused ? <PauseIcon sx={{ fontSize: 13 }} /> : done ? <CheckIcon sx={{ fontSize: 13 }} /> : index + 1}
              </Box>
              <Box sx={{ lineHeight: 1.2 }}>
                <Typography
                  sx={{ fontSize: 13, fontWeight: done || isNext ? 600 : 500, color: done || isNext ? 'text.primary' : 'text.disabled', whiteSpace: 'nowrap', lineHeight: 1.3 }}
                >
                  {step.label}
                </Typography>
                {captions[step.key] ? (
                  <Typography
                    sx={{ fontSize: 11.5, whiteSpace: 'nowrap', lineHeight: 1.3, color: isPaused ? 'var(--warn)' : isNext ? 'var(--info)' : 'text.secondary' }}
                  >
                    {captions[step.key]}
                  </Typography>
                ) : null}
              </Box>
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}
