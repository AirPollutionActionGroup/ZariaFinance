import { useState } from 'react';
import { Box, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { SearchField, StatusChip } from '../../../shared/components/index.js';

/** Status filter values match the backend status strings ('ACTIVE' / 'INACTIVE'). */
const STATUS_FILTERS = [
  { value: 'All', label: 'All', match: () => true },
  { value: 'ACTIVE', label: 'Active', match: (r) => r.status === 'ACTIVE' },
  { value: 'INACTIVE', label: 'Inactive', match: (r) => r.status !== 'ACTIVE' },
];

export function applyStatusFilter(rows, filter) {
  const f = STATUS_FILTERS.find((s) => s.value === filter) || STATUS_FILTERS[0];
  return rows.filter(f.match);
}

/**
 * Search box plus an All / Active / Inactive filter with counts; `action`
 * (e.g. an Add button) sits on the right. Padded to sit inside the masters panel.
 */
export function MasterToolbar({ search, onSearch, placeholder, status, onStatus, rows = [], action = null }) {
  return (
    <Stack direction="row" sx={{ px: { xs: 2, md: 3 }, pb: 2, gap: 1.25, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box sx={{ width: { xs: '100%', sm: 260 } }}>
        <SearchField value={search} onChange={onSearch} placeholder={placeholder} size="small" />
      </Box>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={status}
        onChange={(_e, v) => v && onStatus(v)}
        aria-label="Filter by status"
        sx={{ '& .MuiToggleButton-root': { px: 1.4, py: 0.45, textTransform: 'none', fontWeight: 600, fontSize: 12.5 } }}
      >
        {STATUS_FILTERS.map((f) => {
          const count = rows.filter(f.match).length;
          if (f.value === 'INACTIVE' && count === 0 && status !== f.value) return null;
          return (
            <ToggleButton key={f.value} value={f.value}>
              {f.label} · {count}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
      {action ? <Box sx={{ ml: 'auto' }}>{action}</Box> : null}
    </Stack>
  );
}

export const statusColumn = {
  key: 'status',
  header: 'Status',
  width: 110,
  sortValue: (r) => (r.status === 'ACTIVE' ? 0 : 1),
  render: (r) => (
    <StatusChip
      label={r.statusLabel || (r.status === 'ACTIVE' ? 'Active' : 'Inactive')}
      tone={r.status === 'ACTIVE' ? 'success' : 'neutral'}
    />
  ),
};

/** A row's actions in a "⋯" menu: Edit (when the master allows it) and Activate / Deactivate. */
function RowActions({ row, onEdit, onToggle }) {
  const [anchor, setAnchor] = useState(null);
  const active = row.status === 'ACTIVE';
  const close = () => setAnchor(null);
  return (
    <>
      <Tooltip title="Actions">
        <IconButton
          size="small"
          aria-label={`Actions for ${row.name}`}
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            setAnchor(e.currentTarget);
          }}
          sx={{ color: 'text.secondary' }}
        >
          <MoreHorizRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {onEdit ? (
          <MenuItem
            onClick={() => {
              close();
              onEdit(row);
            }}
          >
            <ListItemIcon>
              <EditOutlinedIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary="Edit" />
          </MenuItem>
        ) : null}
        <MenuItem
          onClick={() => {
            close();
            onToggle(row);
          }}
          sx={{ color: active ? 'var(--warn)' : 'var(--ok)' }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            {active ? <BlockRoundedIcon fontSize="small" /> : <CheckCircleOutlineRoundedIcon fontSize="small" />}
          </ListItemIcon>
          <ListItemText primary={active ? 'Deactivate' : 'Activate'} />
        </MenuItem>
      </Menu>
    </>
  );
}

/** Right-aligned "⋯" column with each row's actions. */
export function actionsColumn({ onEdit, onToggle }) {
  return {
    key: 'actions',
    header: '',
    align: 'right',
    width: 56,
    render: (r) => <RowActions row={r} onEdit={onEdit} onToggle={onToggle} />,
  };
}

/** Bold name cell, optionally with a muted second line. */
export function NameCell({ name, sub, mono = false }) {
  return (
    <Box sx={{ minWidth: 160 }}>
      <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.35, fontFamily: mono ? 'monospace' : undefined }}>
        {name}
      </Typography>
      {sub ? (
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Confirm-dialog wording shared by every master: "Deactivate “X”?" etc. */
export function toggleDialogText(row, noun, extra = '') {
  if (!row) return { title: '', description: '', confirmLabel: 'Confirm' };
  const active = row.status === 'ACTIVE';
  return {
    title: `${active ? 'Deactivate' : 'Activate'} ${noun}?`,
    description: active
      ? `“${row.name}” will be marked inactive.${extra ? ` ${extra}` : ''}`
      : `“${row.name}” will be marked active again.`,
    confirmLabel: active ? 'Deactivate' : 'Activate',
  };
}
