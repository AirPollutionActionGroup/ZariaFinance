import { Box, Stack, Typography } from '@mui/material';

const SMALL_CAPS = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'text.secondary' };

/**
 * The settings menu inside the masters panel: grouped items with an icon, a
 * name and a quiet count. The open one gets a white tile with an ink bar on
 * its left. Below md it becomes a single scrolling row.
 *
 * groups: [{ label, items: [{ id, label, icon, count?: { active, total } }] }]
 */
export function MasterNav({ groups, activeId, onSelect }) {
  return (
    <Box
      component="nav"
      aria-label="Masters"
      sx={{
        bgcolor: 'var(--card2)',
        borderRight: { md: '1px solid var(--line)' },
        borderBottom: { xs: '1px solid var(--line)', md: 'none' },
        py: { xs: 1, md: 2 },
        px: { xs: 1, md: 1.25 },
      }}
    >
      <Stack direction={{ xs: 'row', md: 'column' }} spacing={{ xs: 0.5, md: 2 }} sx={{ overflowX: { xs: 'auto', md: 'visible' } }}>
        {groups.map((group) => (
          <Box key={group.label} sx={{ display: { xs: 'contents', md: 'block' } }}>
            <Typography sx={{ ...SMALL_CAPS, display: { xs: 'none', md: 'block' }, px: 1.25, mb: 0.75 }}>{group.label}</Typography>
            <Stack component="ul" direction={{ xs: 'row', md: 'column' }} spacing={0.25} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {group.items.map((m) => {
                const Icon = m.icon;
                const selected = m.id === activeId;
                return (
                  <Box component="li" key={m.id} sx={{ flexShrink: 0 }}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => onSelect(m.id)}
                      aria-current={selected ? 'page' : undefined}
                      sx={{
                        all: 'unset',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        position: 'relative',
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        pl: 1.5,
                        pr: 1.25,
                        py: 0.9,
                        borderRadius: 1.5,
                        whiteSpace: 'nowrap',
                        color: selected ? 'text.primary' : 'text.secondary',
                        bgcolor: selected ? 'var(--card)' : 'transparent',
                        boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px var(--line)' : 'none',
                        transition: 'background-color .12s, color .12s',
                        '&:hover': { color: 'text.primary', bgcolor: selected ? 'var(--card)' : 'rgba(127,127,127,0.08)' },
                        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 1 },
                        // ink bar on the open item
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: 0,
                          top: 8,
                          bottom: 8,
                          width: 3,
                          borderRadius: 2,
                          bgcolor: selected ? 'var(--ink)' : 'transparent',
                          display: { xs: 'none', md: 'block' },
                        },
                      }}
                    >
                      <Icon sx={{ fontSize: 18, color: selected ? 'text.primary' : 'text.secondary', flexShrink: 0 }} />
                      <Typography component="span" sx={{ fontSize: 13.5, fontWeight: selected ? 600 : 500, flex: 1, minWidth: 0 }}>
                        {m.label}
                      </Typography>
                      {m.count ? (
                        <Typography
                          component="span"
                          sx={{ fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'text.secondary', fontWeight: selected ? 600 : 400, ml: 1 }}
                        >
                          {m.count.total}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

/** Header of the open master: name, what it's for, and its active / inactive counts. */
export function MasterHeading({ master, count }) {
  const inactive = count ? count.total - count.active : 0;
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, pt: { xs: 2, md: 2.5 }, pb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
        <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, textTransform: 'none' }}>
          {master.label}
        </Typography>
        {count ? (
          <Stack direction="row" spacing={0.75}>
            <Box component="span" sx={pillSx('var(--ok)', 'var(--ok-bg)')}>
              {count.active} active
            </Box>
            {inactive ? (
              <Box component="span" sx={pillSx('var(--muted)', 'var(--card2)')}>
                {inactive} inactive
              </Box>
            ) : null}
          </Stack>
        ) : null}
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        {master.description}
      </Typography>
    </Box>
  );
}

const pillSx = (fg, bg) => ({
  px: 1,
  py: 0.1,
  borderRadius: 999,
  fontSize: 11.5,
  fontWeight: 600,
  lineHeight: 1.7,
  color: fg,
  bgcolor: bg,
  whiteSpace: 'nowrap',
});
