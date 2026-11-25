import { Box, Card, CardContent, Stack, Typography } from '@mui/material';

/** Centered card on a warm ivory backdrop for public screens. */
/** `compact` tightens the spacing for short forms such as sign-in. */
export function AuthLayout({ children, maxWidth = 440, compact = false }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        px: 2,
        py: compact ? { xs: 3, md: 4 } : { xs: 4, md: 8 },
      }}
    >
      {/* Brand lockup. Not a heading: each page's own title is the page's h1. */}
      <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: compact ? 2 : 3 }}>
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            borderRadius: 1,
            bgcolor: 'text.primary',
            color: 'background.paper',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 18,
          }}
        >
          Z
        </Box>
        <Box>
          <Typography component="div" sx={{ fontWeight: 700, fontSize: 20, lineHeight: 1.1, letterSpacing: '0.01em' }}>
            Zariya
          </Typography>
          <Typography variant="overline" component="div" sx={{ lineHeight: 1.6, color: 'secondary.main' }}>
            Budgeting · Trading · Reporting
          </Typography>
        </Box>
      </Stack>

      <Box sx={{ width: '100%', maxWidth }}>
        <Card sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, boxShadow: '0 8px 28px rgba(0, 0, 0, 0.06)' }}>
          <CardContent sx={compact ? { p: { xs: 2.5, sm: 3 }, '&:last-child': { pb: { xs: 2.5, sm: 3 } } } : { p: { xs: 3, sm: 4 }, '&:last-child': { pb: { xs: 3, sm: 4 } } }}>
            {children}
          </CardContent>
        </Card>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: compact ? 2 : 4, textAlign: "center" }}>
        © {new Date().getFullYear()} The Convergence Foundation · Authorized personnel only
      </Typography>
    </Box>
  );
}
