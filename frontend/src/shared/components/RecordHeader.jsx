import { Fragment } from 'react';
import { Box, Card, Stack, Tooltip, Typography } from '@mui/material';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';

/**
 * A breadcrumb trail back up to a record's list: [{ label, onClick? }] — the
 * first link gets a back arrow, the last item is the current page.
 */
export function Breadcrumbs({ items = [], sx }) {
  if (!items.length) return null;
  return (
    <Box component="nav" aria-label="Breadcrumb" sx={{ mb: 1.5, ...sx }}>
      <Stack component="ol" direction="row" alignItems="center" sx={{ listStyle: 'none', m: 0, p: 0, flexWrap: 'wrap', rowGap: 0.5 }}>
        {items.map((b, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 ? (
                <Box component="li" aria-hidden sx={{ display: 'inline-flex', color: 'text.disabled', mx: 0.25 }}>
                  <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                </Box>
              ) : null}
              <Box component="li" sx={{ display: 'inline-flex', minWidth: 0 }}>
                {b.onClick && !last ? (
                  <Box
                    component="button"
                    type="button"
                    onClick={b.onClick}
                    sx={{
                      font: 'inherit',
                      fontSize: 13,
                      fontWeight: 500,
                      border: 0,
                      p: 0,
                      bgcolor: 'transparent',
                      color: 'text.secondary',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      borderRadius: 0.5,
                      '&:hover': { color: 'text.primary', textDecoration: 'underline', textUnderlineOffset: 3 },
                      '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    }}
                  >
                    {i === 0 ? <ArrowBackRoundedIcon sx={{ fontSize: 16 }} /> : null}
                    {b.label}
                  </Box>
                ) : (
                  <Typography
                    component="span"
                    aria-current={last ? 'page' : undefined}
                    noWrap
                    sx={{ fontSize: 13, fontWeight: last ? 600 : 500, color: last ? 'text.primary' : 'text.secondary', maxWidth: 360 }}
                  >
                    {b.label}
                  </Typography>
                )}
              </Box>
            </Fragment>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Header for a single record's page (a budget, a tranche, an outflow row):
 * a breadcrumb trail back to its list, then one card with the record's type
 * icon, codes, its own name (as typed — not title-cased) with its status, a
 * quiet line of key facts, and the actions on the right.
 *
 * breadcrumbs: [{ label, onClick? }] — the last one is the current page.
 * meta: [{ icon?: MuiIcon, dot?: cssColor, label: node, strong?: bool, hint?: string }]
 * footer: optional strip under a divider — e.g. the approval workflow (a note on the left, buttons on the right).
 */
export function RecordHeader({ breadcrumbs = [], icon: Icon = null, iconHint, eyebrow, title, status = null, meta = [], actions = null, footer = null }) {
  return (
    <Box sx={{ mb: 2 }}>
      <Breadcrumbs items={breadcrumbs} />

      <Card sx={{ px: { xs: 2, sm: 2.5 }, py: 2, overflow: 'hidden' }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems={{ lg: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
            {Icon ? (
              <Tooltip title={iconHint || ''} disableHoverListener={!iconHint}>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    flexShrink: 0,
                    borderRadius: 2,
                    display: { xs: 'none', sm: 'grid' },
                    placeItems: 'center',
                    bgcolor: 'var(--card2)',
                    border: '1px solid var(--line)',
                    color: 'text.secondary',
                  }}
                >
                  <Icon sx={{ fontSize: 26 }} />
                </Box>
              </Tooltip>
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              {eyebrow ? (
                <Typography variant="overline" color="secondary.main" sx={{ display: 'block', lineHeight: 1.5 }}>
                  {eyebrow}
                </Typography>
              ) : null}
              {/* gap, not spacing: spacing's margin would indent the status chip when it wraps under the title. */}
              <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', columnGap: 1.25, rowGap: 0.5 }}>
                <Typography
                  component="h1"
                  sx={{
                    fontWeight: 700,
                    fontSize: { xs: 22, md: 26 },
                    lineHeight: 1.25,
                    letterSpacing: '-0.015em',
                    textTransform: 'none', // a record's name is shown exactly as entered
                    overflowWrap: 'anywhere',
                  }}
                >
                  {title}
                </Typography>
                {status}
              </Stack>
              {meta.length ? (
                <Stack direction="row" alignItems="center" sx={{ mt: 0.75, flexWrap: 'wrap', columnGap: 2.25, rowGap: 0.5 }}>
                  {meta.map((m, i) => {
                    const MIcon = m.icon;
                    const item = (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.6,
                          fontSize: 13.5,
                          fontWeight: m.strong ? 600 : 400,
                          color: m.strong ? 'text.primary' : 'text.secondary',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {MIcon ? <MIcon sx={{ fontSize: 16, color: 'text.secondary' }} /> : null}
                        {m.dot ? <Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: m.dot }} /> : null}
                        {m.label}
                      </Box>
                    );
                    return m.hint ? (
                      <Tooltip key={i} title={m.hint} describeChild>{item}</Tooltip>
                    ) : (
                      <Box component="span" key={i} sx={{ display: 'inline-flex' }}>{item}</Box>
                    );
                  })}
                </Stack>
              ) : null}
            </Box>
          </Stack>
          {actions ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, flexWrap: 'wrap', rowGap: 1 }}>
              {actions}
            </Stack>
          ) : null}
        </Stack>
        {footer ? (
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            alignItems={{ md: 'center' }}
            justifyContent="space-between"
            sx={{ mt: 2, mx: { xs: -2, sm: -2.5 }, mb: -2, px: { xs: 2, sm: 2.5 }, py: 1.5, borderTop: '1px solid var(--line)', bgcolor: 'var(--card2)' }}
          >
            {footer}
          </Stack>
        ) : null}
      </Card>
    </Box>
  );
}
