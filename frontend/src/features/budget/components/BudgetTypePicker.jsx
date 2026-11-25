import { useRef } from 'react';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { BUDGET_TYPE, BUDGET_TYPE_HINT } from '../constants.js';
import { BUDGET_TYPE_ICON } from './budgetTypeIcons.js';

const ICON = BUDGET_TYPE_ICON;

/**
 * Budget type as three compact selectable cards (a radio group): Organisation,
 * Programme, Project. Arrow keys move between them, like native radios.
 */
export function BudgetTypePicker({ value, onChange, error, hideLabel = false }) {
  const codes = Object.keys(BUDGET_TYPE);
  const refs = useRef({});

  const onKeyDown = (e, index) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const next = codes[(index + step + codes.length) % codes.length];
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <Box>
      {hideLabel ? null : (
        <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ display: 'block', mb: 0.75, fontWeight: 600 }}>
          Budget type *
        </Typography>
      )}
      <Box
        role="radiogroup"
        aria-label="Budget type"
        sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}
      >
        {codes.map((code, index) => {
          const selected = value === code;
          const Icon = ICON[code];
          return (
            <Box
              key={code}
              ref={(el) => { refs.current[code] = el; }}
              component="button"
              type="button"
              role="radio"
              aria-checked={selected}
              // Roving tab stop: only the chosen card (or the first, when none is) is tabbable.
              tabIndex={selected || (!value && index === 0) ? 0 : -1}
              onClick={() => onChange(code)}
              onKeyDown={(e) => onKeyDown(e, index)}
              sx={(theme) => ({
                minWidth: 0,
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                px: 1.5,
                py: 1,
                borderRadius: 2,
                border: '1.5px solid',
                borderColor: selected ? 'primary.main' : error ? 'error.main' : 'divider',
                bgcolor: selected ? alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.16 : 0.06) : 'background.paper',
                transition: 'border-color .15s ease, background-color .15s ease',
                '&:hover': { borderColor: 'primary.main' },
                '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
              })}
            >
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 1.5,
                  display: 'grid',
                  placeItems: 'center',
                  bgcolor: selected ? 'primary.main' : 'action.hover',
                  color: selected ? 'primary.contrastText' : 'text.secondary',
                  transition: 'background-color .15s ease, color .15s ease',
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
              </Box>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                  {BUDGET_TYPE[code]}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  title={BUDGET_TYPE_HINT[code]}
                  sx={{ display: 'block', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {BUDGET_TYPE_HINT[code]}
                </Typography>
              </Box>
              {/* Radio dot: filled with a tick when chosen. */}
              <Box
                aria-hidden
                sx={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  border: '1.5px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'primary.main' : 'transparent',
                  color: 'primary.contrastText',
                }}
              >
                {selected ? <CheckRoundedIcon sx={{ fontSize: 13 }} /> : null}
              </Box>
            </Box>
          );
        })}
      </Box>
      {error ? (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.75 }}>{error}</Typography>
      ) : null}
    </Box>
  );
}
