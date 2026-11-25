import { Box, Card, Stack, Typography } from '@mui/material';

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };
const blank = (v) => v == null || (typeof v === 'string' && v.trim() === '');

/** A card with a plain title row and a hairline under it; optional `aside` on the right and a muted `footer` strip. */
export function Panel({ title, aside, footer, children, sx, bodySx }) {
  return (
    <Card sx={sx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid var(--line)' }}>
        <Typography component="h2" sx={{ fontSize: 15, fontWeight: 700, textTransform: 'none' }}>{title}</Typography>
        {aside}
      </Stack>
      <Box sx={{ px: 2.5, py: 2, ...bodySx }}>{children}</Box>
      {footer ? (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ px: 2.5, py: 1.25, borderTop: '1px solid var(--line2)', bgcolor: 'var(--card2)' }}>
          {footer}
        </Typography>
      ) : null}
    </Card>
  );
}

/**
 * One section of a details card: a small-caps heading, then label-over-value
 * fields in a grid. Empty fields show "—" (or `emptyText`) so the layout stays
 * steady and gaps are visible; `hideEmpty` drops them instead.
 * fields: [{ label, value, mono?, wide?, span?, emptyText?, hideEmpty? }]
 */
export function FieldSection({ title, fields, first = false, columns = 3 }) {
  const shown = fields.filter((f) => !(f.hideEmpty && blank(f.value)));
  return (
    <Box sx={{ pt: first ? 0 : 2.5, mt: first ? 0 : 2.5, borderTop: first ? 'none' : '1px solid var(--line2)' }}>
      {title ? <Typography component="h3" sx={{ ...SMALL_CAPS, mb: 1.5 }}>{title}</Typography> : null}
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          columnGap: 3,
          rowGap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: `repeat(${columns}, minmax(0, 1fr))` },
        }}
      >
        {shown.map((f) => (
          <Box key={f.label} sx={{ minWidth: 0, gridColumn: f.wide ? { sm: '1 / -1' } : f.span ? { sm: `span ${f.span}` } : undefined }}>
            <Typography component="dt" variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
              {f.label}
            </Typography>
            <Typography
              component="dd"
              variant="body2"
              sx={{
                m: 0,
                fontWeight: blank(f.value) ? 400 : 600,
                color: blank(f.value) ? 'text.disabled' : 'text.primary',
                overflowWrap: 'anywhere',
                whiteSpace: 'pre-line',
                fontFamily: f.mono ? 'monospace' : undefined,
              }}
            >
              {blank(f.value) ? f.emptyText || '—' : f.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
