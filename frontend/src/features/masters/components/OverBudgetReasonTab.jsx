import { useMemo, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { ConfirmDialog, DataTable } from '../../../shared/components/index.js';
import { MasterToolbar, NameCell, actionsColumn, applyStatusFilter, statusColumn, toggleDialogText } from './MasterListParts.jsx';
import {
  useCreateOverBudgetReason,
  useOverBudgetReasonLifecycle,
  useOverBudgetReasons,
  useUpdateOverBudgetReason,
} from '../hooks/useOverBudgetReasons.js';

const EMPTY_FORM = { name: '', description: '', status: 'ACTIVE' };

/**
 * Masters → Over-budget reasons (server-backed, /api/v1/over-budget-reasons):
 * why a debit note took its budget line over budget. The debit note form
 * offers the active ones. `createOpen` / `onCreateClose` come from the page.
 */
export function OverBudgetReasonTab({ createOpen, onCreate, onCreateClose }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toToggle, setToToggle] = useState(null);

  const reasonsQuery = useOverBudgetReasons(search);
  const createReason = useCreateOverBudgetReason();
  const updateReason = useUpdateOverBudgetReason();
  const lifecycle = useOverBudgetReasonLifecycle();
  const saving = createReason.isPending || updateReason.isPending;
  const saveError = createReason.error || updateReason.error;
  const dialogOpen = createOpen || Boolean(editing);

  const rows = useMemo(() => applyStatusFilter(reasonsQuery.data || [], statusFilter), [reasonsQuery.data, statusFilter]);

  const openEdit = (reason) => {
    createReason.reset();
    updateReason.reset();
    setForm({ name: reason.name, description: reason.description || '', status: reason.status });
    setEditing(reason);
  };

  const closeDialog = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    createReason.reset();
    updateReason.reset();
    onCreateClose();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      if (editing) await updateReason.mutateAsync({ id: editing.id, values: form });
      else await createReason.mutateAsync(form);
      closeDialog();
    } catch {
      // Shown in the dialog via saveError.
    }
  };

  const handleConfirmToggle = async () => {
    if (!toToggle) return;
    await lifecycle.mutateAsync({ id: toToggle.id, action: toToggle.status === 'ACTIVE' ? 'deactivate' : 'activate' });
    setToToggle(null);
  };

  const columns = [
    {
      key: 'name',
      header: 'Reason',
      sortValue: (r) => r.name,
      render: (r) => <NameCell name={r.name} sub={r.description || null} />,
    },
    {
      key: 'used',
      header: 'Used on',
      width: 150,
      sortValue: (r) => r.usedCount,
      render: (r) => (
        <Typography variant="body2" color={r.usedCount ? 'text.primary' : 'text.secondary'}>
          {r.usedCount ? `${r.usedCount} debit ${r.usedCount === 1 ? 'note' : 'notes'}` : 'Not used yet'}
        </Typography>
      ),
    },
    statusColumn,
    actionsColumn({ onEdit: openEdit, onToggle: setToToggle }),
  ];

  const toggleText = toggleDialogText(
    toToggle,
    'over-budget reason',
    'Debit notes that already give it keep it, but it will no longer be offered on new debit notes.',
  );

  return (
    <Box>
      <MasterToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search reasons…"
        status={statusFilter}
        onStatus={setStatusFilter}
        rows={reasonsQuery.data || []}
        action={
          <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
            New reason
          </Button>
        }
      />

      <DataTable
        dense
        flat
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        defaultSort={{ key: 'name', direction: 'asc' }}
        isLoading={reasonsQuery.isPending}
        error={reasonsQuery.isError ? reasonsQuery.error : null}
        onRetry={reasonsQuery.refetch}
        emptyTitle="No over-budget reasons found"
        emptyDescription="Reasons a debit note can give when it takes a budget line over budget — Additional charge, FX difference, …"
      />

      <Dialog open={dialogOpen} onClose={saving ? undefined : closeDialog} maxWidth="xs" fullWidth>
        <form onSubmit={handleSave}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editing ? 'Edit over-budget reason' : 'New over-budget reason'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                label="Reason"
                placeholder="e.g. Emergency purchase"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                fullWidth
                size="small"
                autoFocus
                slotProps={{ htmlInput: { maxLength: 255 } }}
              />
              <TextField
                label="Description (optional)"
                placeholder="When to use it"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                fullWidth
                size="small"
                multiline
                minRows={2}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
              {editing ? (
                editing.usedCount ? (
                  <Typography variant="caption" color="text.secondary">
                    Used on {editing.usedCount} debit {editing.usedCount === 1 ? 'note' : 'notes'} — they show the new name.
                  </Typography>
                ) : null
              ) : (
                <TextField
                  select
                  label="Status"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  required
                  fullWidth
                  size="small"
                >
                  <MenuItem value="ACTIVE">Active</MenuItem>
                  <MenuItem value="INACTIVE">Inactive</MenuItem>
                </TextField>
              )}
              {saveError ? <Alert severity="error">{saveError.message || 'Could not save the reason.'}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, pt: 1 }}>
            <Button onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={!form.name.trim() || saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save reason'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(toToggle)}
        title={toggleText.title}
        description={toggleText.description}
        confirmLabel={toggleText.confirmLabel}
        confirmColor={toToggle?.status === 'ACTIVE' ? 'warning' : 'primary'}
        busy={lifecycle.isPending}
        onConfirm={handleConfirmToggle}
        onClose={() => setToToggle(null)}
      />
    </Box>
  );
}
