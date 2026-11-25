import {
  Box,
  ButtonBase,
  Card,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { formatInrExact } from '../../../lib/format/currency.js';
import { BOOK } from '../../../shared/constants/book.js';
import { budgetTotal, lineTotal, quarterTotals } from '../lib/budgetMath.js';
import { QUARTERS } from '../constants.js';
import { useBudgetCategories } from '../../masters/hooks/useBudgetCategories.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };

/** Number inputs without the browser's spinner arrows (they nudge amounts by accident). */
const NO_SPINNER_SX = {
  '& input[type=number]': { MozAppearance: 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
};

let tempId = 0;
export function newLine(overrides = {}) {
  tempId += 1;
  return {
    category: '',
    description: '',
    book: 'LC',
    q1: '',
    q2: '',
    q3: '',
    q4: '',
    ...overrides,
    id: `new-${tempId}`, // always fresh, so newLine(existing) is a safe copy
  };
}

function LineCard({ line, index, categories, categoriesHint, errors = {}, grandTotal, onChange, onDuplicate, onRemove, canRemove }) {
  const set = (field) => (e) => onChange({ ...line, [field]: e.target.value });
  // Active categories, plus this line's own category if it has since been deactivated (shown, not pickable).
  const categoryOptions = categories.filter((c) => c.status === 'ACTIVE' || c.id === line.category);
  // Keep a saved category selectable while the list loads (or if it's no longer on the server).
  if (line.category && !categoryOptions.some((c) => c.id === line.category)) {
    categoryOptions.unshift({ id: line.category, name: `Category #${line.category}`, status: 'UNKNOWN' });
  }
  const hasError = Object.keys(errors).length > 0;
  const total = lineTotal(line);
  const share = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;

  return (
    <Box
      sx={{
        position: 'relative',
        p: { xs: 1.75, sm: 2 },
        pl: { xs: 1.75, sm: 7 },
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: hasError ? 'error.main' : 'divider',
        bgcolor: 'background.paper',
        containerType: 'inline-size',
        containerName: 'budgetLine',
        transition: 'border-color .15s ease, box-shadow .15s ease',
        '&:focus-within': { borderColor: hasError ? 'error.main' : 'text.secondary', boxShadow: '0 4px 14px -6px rgba(0,0,0,.18)' },
        '&:hover .line-actions': { opacity: 1 },
      }}
    >
      {/* Line number badge (top-left on wide screens, inline header on phones). */}
      <Box
        sx={{
          position: { sm: 'absolute' },
          left: 16,
          top: 18,
          mb: { xs: 1.25, sm: 0 },
          width: 30,
          height: 30,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: 12.5,
          fontWeight: 700,
          ...MONEY_SX,
          bgcolor: hasError ? 'error.main' : 'action.hover',
          color: hasError ? 'error.contrastText' : 'text.secondary',
        }}
      >
        {index + 1}
      </Box>

      <Stack
        className="line-actions"
        direction="row"
        spacing={0.25}
        sx={{ position: 'absolute', right: 8, top: 8, opacity: { xs: 1, md: 0.55 }, transition: 'opacity .15s ease' }}
      >
        <Tooltip title="Duplicate line">
          <IconButton size="small" onClick={onDuplicate} aria-label={`Duplicate line ${index + 1}`}>
            <ContentCopyOutlinedIcon sx={{ fontSize: 17 }} />
          </IconButton>
        </Tooltip>
        <Tooltip title={canRemove ? 'Remove line' : 'A budget needs at least one line'}>
          <span>
            <IconButton size="small" onClick={onRemove} disabled={!canRemove} aria-label={`Remove line ${index + 1}`}>
              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      <Grid container spacing={1.5} sx={{ pr: { xs: 0, sm: 8 } }}>
        <Grid size={{ xs: 12, md: 4 }}>
          <TextField
            select
            fullWidth
            size="small"
            label="Category *"
            value={line.category}
            onChange={set('category')}
            error={Boolean(errors.category)}
            helperText={errors.category || categoriesHint}
          >
            {categoryOptions.map((c) => (
              <MenuItem key={c.id} value={c.id} disabled={c.status !== 'ACTIVE'}>
                {c.name}{c.status === 'INACTIVE' ? ' (inactive)' : ''}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 8, md: 5.5 }}>
          <TextField
            fullWidth
            size="small"
            label="Description *"
            placeholder="What is this money for?"
            value={line.description}
            onChange={set('description')}
            error={Boolean(errors.description)}
            helperText={errors.description}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4, md: 2.5 }}>
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            value={line.book}
            onChange={(_, value) => value && onChange({ ...line, book: value })}
            aria-label={`Book for line ${index + 1}`}
            sx={{ height: 40, '& .MuiToggleButton-root': { fontWeight: 700, letterSpacing: '0.04em', textTransform: 'none' } }}
          >
            {Object.entries(BOOK).map(([code, label]) => (
              <Tooltip key={code} title={label}>
                <ToggleButton value={code} aria-label={label}>{code}</ToggleButton>
              </Tooltip>
            ))}
          </ToggleButtonGroup>
        </Grid>
      </Grid>

      <Box
        sx={{
          mt: 1.5,
          pt: 1.5,
          borderTop: '1px dashed',
          borderColor: 'divider',
          display: 'grid',
          gap: 1.5,
          // Sized by the card's own width (container queries), not the window: the card is
          // narrower than the window once the summary panel sits beside it.
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          '@container budgetLine (min-width: 460px)': { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' },
          alignItems: 'center',
          '& .line-total': { gridColumn: '1 / -1', textAlign: 'right' },
          '@container budgetLine (min-width: 620px)': {
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) 150px',
            '& .line-total': { gridColumn: 'auto' },
          },
        }}
      >
        {QUARTERS.map((q) => (
          <TextField
            key={q.key}
            size="small"
            type="number"
            label={`${q.label} · ${q.months}`}
            placeholder="0"
            value={line[q.key]}
            onChange={set(q.key)}
            error={Boolean(errors.amount)}
            sx={NO_SPINNER_SX}
            slotProps={{
              input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
              htmlInput: { min: 0, step: 'any', inputMode: 'decimal', style: { textAlign: 'right' } },
            }}
          />
        ))}
        <Box className="line-total">
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 10.5 }}>
            Line total{grandTotal > 0 && total > 0 ? ` · ${share}%` : ''}
          </Typography>
          <Typography sx={{ ...MONEY_SX, fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}>{formatInrExact(total)}</Typography>
        </Box>
      </Box>
      {errors.amount ? (
        <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.75 }}>{errors.amount}</Typography>
      ) : null}
    </Box>
  );
}

/** Editable list of budget lines; the running totals live in the page's summary panel. */
export function BudgetLineEditor({ lines, onChange, errors = {} }) {
  const categoriesQuery = useBudgetCategories();
  const categories = categoriesQuery.data || [];
  const categoriesHint = categoriesQuery.isPending
    ? 'Loading categories…'
    : categoriesQuery.isError
      ? 'Could not load categories from the server'
      : categories.some((c) => c.status === 'ACTIVE')
        ? undefined
        : 'Add categories in Master → Budget Category';
  const update = (id, next) => onChange(lines.map((l) => (l.id === id ? next : l)));
  const remove = (id) => onChange(lines.filter((l) => l.id !== id));
  const duplicate = (index) => onChange([...lines.slice(0, index + 1), newLine(lines[index]), ...lines.slice(index + 1)]);
  const grandTotal = budgetTotal(lines);
  const qTotals = quarterTotals(lines);

  return (
    <Stack spacing={1.25}>
      {lines.map((line, index) => (
        <LineCard
          key={line.id}
          line={line}
          categories={categories}
          categoriesHint={categoriesHint}
          index={index}
          errors={errors[line.id]}
          grandTotal={grandTotal}
          onChange={(next) => update(line.id, next)}
          onDuplicate={() => duplicate(index)}
          onRemove={() => remove(line.id)}
          canRemove={lines.length > 1}
        />
      ))}

      <ButtonBase
        onClick={() => onChange([...lines, newLine()])}
        sx={{
          width: '100%',
          py: 1.5,
          gap: 1,
          borderRadius: 2.5,
          border: '1.5px dashed',
          borderColor: 'divider',
          color: 'text.secondary',
          font: 'inherit',
          fontWeight: 600,
          fontSize: 14,
          transition: 'border-color .15s ease, color .15s ease, background-color .15s ease',
          '&:hover, &.Mui-focusVisible': { borderColor: 'primary.main', color: 'text.primary', bgcolor: 'action.hover' },
        }}
      >
        <AddRoundedIcon fontSize="small" />
        Add budget line
      </ButtonBase>

      <Card sx={{ px: 2.5, py: 1.75, bgcolor: 'var(--card2)' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1, sm: 3 }} alignItems={{ sm: 'center' }} justifyContent="space-between">
          <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            {QUARTERS.map((q) => (
              <Box key={q.key}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{q.label}</Typography>
                <Typography variant="body2" sx={{ ...MONEY_SX, fontWeight: 600 }}>{formatInrExact(qTotals[q.key])}</Typography>
              </Box>
            ))}
          </Stack>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Budget total · {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </Typography>
            <Typography sx={{ ...MONEY_SX, fontWeight: 700, fontSize: 22 }}>{formatInrExact(grandTotal)}</Typography>
          </Box>
        </Stack>
      </Card>
    </Stack>
  );
}
