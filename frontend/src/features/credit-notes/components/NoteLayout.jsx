import { Box, Button, Card, CardContent, Grid, Stack, Typography } from '@mui/material';

export const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };

/** Section card in the app's form style: icon badge, "01" number, title, one-line hint. `color` is a palette key. */
export function FormSection({ number, icon: Icon, title, description, action = null, color = 'success', children }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, mb: 2 }}>
      <CardContent sx={{ p: { xs: 2.25, sm: 2.75 } }}>
        <Stack direction="row" spacing={1.75} alignItems="center" sx={{ mb: 2.25 }}>
          <Box
            sx={{
              width: 36,
              height: 36,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 2,
              bgcolor: `${color}.main`,
              color: `${color}.contrastText`,
            }}
          >
            <Icon sx={{ fontSize: 20 }} />
          </Box>
          <Box flex={1}>
            <Stack direction="row" spacing={1} alignItems="baseline">
              <Typography variant="caption" sx={{ fontWeight: 700, color: `${color}.main`, letterSpacing: '0.06em' }}>
                {number}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {title}
              </Typography>
            </Stack>
            {description ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {description}
              </Typography>
            ) : null}
          </Box>
          {action}
        </Stack>
        <Grid container spacing={2}>
          {children}
        </Grid>
      </CardContent>
    </Card>
  );
}

/** One labelled figure in a summary strip. */
export function Figure({ label, value, color, strong = false }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10.5 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: strong ? 700 : 600, color }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Label/value row in the register style used on detail pages. */
export function TermRow({ label, children, last = false }) {
  return (
    <Stack direction="row" spacing={2} sx={{ py: 1.5, alignItems: 'center', borderBottom: last ? 'none' : '1px solid', borderColor: 'divider' }}>
      <Typography
        variant="caption"
        sx={{ width: { xs: 130, sm: 170 }, flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary' }}
      >
        {label}
      </Typography>
      <Box sx={{ minWidth: 0 }}>
        {typeof children === 'string' || typeof children === 'number' ? <Typography variant="body1">{children}</Typography> : children}
      </Box>
    </Stack>
  );
}

/** Soft background + strong colour per tone, for icon badges and banners. */
export const TONE_COLORS = {
  success: { bg: 'var(--ok-bg)', fg: 'success.main' },
  error: { bg: 'var(--err-bg)', fg: 'error.main' },
};

/** Detail-page card with an icon badge + title, matching the form's section headers. */
export function Panel({ icon: Icon, title, action = null, tone = 'success', children }) {
  const { bg, fg } = TONE_COLORS[tone] || TONE_COLORS.success;
  return (
    <Card variant="outlined" sx={{ height: '100%', borderRadius: 3 }}>
      <Box sx={{ p: { xs: 2.25, sm: 2.75 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 1.5,
              bgcolor: bg,
              color: fg,
            }}
          >
            <Icon sx={{ fontSize: 18 }} />
          </Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
      </Box>
    </Card>
  );
}

/** One labelled fact in a detail-page summary banner. */
export function Fact({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 10.5, mb: 0.5 }}>
        {label}
      </Typography>
      {typeof children === 'string' ? (
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap title={children}>
          {children}
        </Typography>
      ) : (
        children
      )}
    </Box>
  );
}

export function SectionCard({ title, action = null, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="h4" component="h2">{title}</Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

export const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const FIGURE_CAPS_SX = { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10.5, fontWeight: 600, color: 'text.secondary' };

/** One figure in a list page's figure strip: a label, the amount, and a line of context. */
export function FigureTile({ label, value, sub, color, children }) {
  return (
    <Box sx={{ p: 2.25, minWidth: 0 }}>
      <Typography sx={FIGURE_CAPS_SX}>{label}</Typography>
      <Typography sx={{ ...MONEY_SX, fontSize: 24, fontWeight: 700, lineHeight: 1.3, mt: 0.25, color }}>{value}</Typography>
      {sub ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ...MONEY_SX }}>
          {sub}
        </Typography>
      ) : null}
      {children}
    </Box>
  );
}

/**
 * The figure strip above a notes list: the period and note count, Clear filters
 * when any are on, and four FigureTiles. Its figures follow the filters.
 */
export function FigureStrip({ period, count, filtered, onClearFilters, children }) {
  return (
    <Card variant="outlined" sx={{ mb: 2, borderRadius: 3, overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{ px: 2.25, py: 1, alignItems: 'center', bgcolor: 'var(--card2)', borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
          {period}
          <Box component="span" sx={{ color: 'text.secondary', fontWeight: 400 }}>
            {' '}· {plural(count, 'note')}
          </Box>
        </Typography>
        {filtered ? (
          <Button size="small" color="inherit" onClick={onClearFilters} sx={{ color: 'text.secondary' }}>
            Clear filters
          </Button>
        ) : null}
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' },
          '& > *:not(:last-child)': { borderRight: { md: '1px solid' }, borderColor: { md: 'divider' } },
        }}
      >
        {children}
      </Box>
    </Card>
  );
}

/** LC / FC split as a thin bar (LC green, FC dark). */
export function BookSplitBar({ lc, fc }) {
  const lcShare = lc + fc > 0 ? (lc / (lc + fc)) * 100 : 0;
  return (
    <Box sx={{ mt: 1, height: 6, borderRadius: 3, bgcolor: fc ? 'var(--ink, #222)' : 'var(--line2)', overflow: 'hidden' }}>
      <Box sx={{ height: '100%', width: `${lcShare}%`, bgcolor: 'success.main' }} />
    </Box>
  );
}
