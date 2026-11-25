import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { ConfirmDialog, DataTable, StatusChip } from '../../../shared/components/index.js';
import {
  MasterToolbar,
  NameCell,
  actionsColumn,
  applyStatusFilter,
  statusColumn,
  toggleDialogText,
} from './MasterListParts.jsx';
import {
  useCreateDocumentType,
  useDocumentTypeLifecycle,
  useDocumentTypes,
  useUpdateDocumentType,
} from '../hooks/useDocumentTypes.js';
import { useDonorTypes } from '../hooks/useDonorTypes.js';

const EMPTY_FORM = { name: '', status: 'ACTIVE', allowedFundSourceDomiciles: [], requiredForDonorTypeIds: [] };

const DOMICILE_LABEL = { DOMESTIC: 'Domestic', FOREIGN: 'Foreign' };


/**
 * Master Configuration → Document Type (server-backed, /api/v1/document-types):
 * the identity documents a donor can be identified by (PAN Card, Aadhaar Card, …).
 * Same layout as the Budget Category tab. `createOpen` / `onCreateClose` are
 * driven by the toolbar's "Add Document Type" button.
 */
export function DocumentTypeTab({ createOpen, onCreateClose, onCreate }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [toToggle, setToToggle] = useState(null);
  // Fund source domicile is mandatory: flag it once the user has left the field empty.
  const [domicileTouched, setDomicileTouched] = useState(false);
  const domicileMissing = domicileTouched && form.allowedFundSourceDomiciles.length === 0;

  const typesQuery = useDocumentTypes(search);
  // Donor types for "Required for": all of them, so a requirement on an inactive one still shows.
  const donorTypes = useDonorTypes('').data || [];
  const donorTypeName = (id) => donorTypes.find((d) => String(d.id) === String(id))?.name || `#${id}`;
  const createType = useCreateDocumentType();
  const updateType = useUpdateDocumentType();
  const lifecycle = useDocumentTypeLifecycle();
  const saving = createType.isPending || updateType.isPending;
  const saveError = createType.error || updateType.error;
  const dialogOpen = createOpen || Boolean(editing);

  const rows = useMemo(() => {
    const list = typesQuery.data || [];
    return applyStatusFilter(list, statusFilter);
  }, [typesQuery.data, statusFilter]);

  const openEdit = (type) => {
    createType.reset();
    updateType.reset();
    setForm({
      name: type.name,
      status: type.status,
      allowedFundSourceDomiciles: type.allowedFundSourceDomiciles || [],
      requiredForDonorTypeIds: (type.requiredForDonorTypeIds || []).map(String),
    });
    setEditing(type);
  };

  const closeDialog = () => {
    setDomicileTouched(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    createType.reset();
    updateType.reset();
    onCreateClose();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.allowedFundSourceDomiciles.length) {
      setDomicileTouched(true);
      return;
    }
    try {
      if (editing) await updateType.mutateAsync({ id: editing.id, values: form });
      else await createType.mutateAsync(form);
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
      header: 'Document type',
      sortValue: (r) => r.name,
      render: (r) => <NameCell name={r.name} />,
    },
    {
      key: 'domicile',
      header: 'Fund source',
      sortValue: (r) => r.allowedFundSourceDomiciles.join(','),
      render: (r) => (
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
          {r.allowedFundSourceDomiciles.map((v) => (
            <StatusChip key={v} label={DOMICILE_LABEL[v] || v} tone={v === 'FOREIGN' ? 'graphite' : 'neutral'} />
          ))}
        </Stack>
      ),
    },
    {
      key: 'required',
      header: 'Required for',
      sortValue: (r) => (r.requiredForDonorTypeIds || []).length,
      render: (r) =>
        r.requiredForDonorTypeIds.length ? (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            {r.requiredForDonorTypeIds.map((id) => (
              <StatusChip key={id} label={donorTypeName(id)} tone="warning" />
            ))}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            Optional
          </Typography>
        ),
    },
    statusColumn,
    actionsColumn({ onEdit: openEdit, onToggle: setToToggle }),
  ];

  const toggleText = toggleDialogText(
    toToggle,
    'document type',
    'Donors that already use it keep it, but it will no longer be offered on the donor form.',
  );

  return (
    <Box>
      <MasterToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search document types…"
        status={statusFilter}
        onStatus={setStatusFilter}
        rows={typesQuery.data || []}
        action={<Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>New document type</Button>}
      />

      <DataTable
        dense
        flat
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        defaultSort={{ key: 'name', direction: 'asc' }}
        isLoading={typesQuery.isPending}
        error={typesQuery.isError ? typesQuery.error : null}
        onRetry={typesQuery.refetch}
        emptyTitle="No document types found"
        emptyDescription="Document types are the ID documents a donor can be identified by — PAN Card, Aadhaar Card, Passport ID, …"
      />

      <Dialog open={dialogOpen} onClose={saving ? undefined : closeDialog} maxWidth="xs" fullWidth>
        <form onSubmit={handleSave}>
          <DialogTitle sx={{ fontWeight: 700 }}>{editing ? 'Edit document type' : 'New document type'}</DialogTitle>
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <TextField
                label="Document Type Name"
                placeholder="e.g. GST Number"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                fullWidth
                size="small"
                autoFocus
              />
              <TextField
                select
                required
                label="Fund Source Domicile"
                value={form.allowedFundSourceDomiciles}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, allowedFundSourceDomiciles: typeof v === 'string' ? v.split(',') : v }));
                }}
                onBlur={() => setDomicileTouched(true)}
                error={domicileMissing}
                fullWidth
                size="small"
                helperText={domicileMissing ? 'Choose Domestic, Foreign or both' : 'Which donors this ID type is offered to — Domestic, Foreign or both.'}
                slotProps={{
                  select: {
                    multiple: true,
                    displayEmpty: true,
                    onClose: () => setDomicileTouched(true),
                    renderValue: (selected) =>
                      selected.length ? (
                        selected.map((v) => DOMICILE_LABEL[v] || v).join(', ')
                      ) : (
                        <Box component="span" sx={{ color: 'text.disabled' }}>Choose Domestic, Foreign or both</Box>
                      ),
                  },
                  inputLabel: { shrink: true },
                }}
              >
                {Object.entries(DOMICILE_LABEL).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    <Checkbox size="small" checked={form.allowedFundSourceDomiciles.includes(value)} sx={{ py: 0, pl: 0 }} />
                    {label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Required for"
                value={form.requiredForDonorTypeIds}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({ ...f, requiredForDonorTypeIds: typeof v === 'string' ? v.split(',') : v }));
                }}
                fullWidth
                size="small"
                helperText="Donors of these types must give this document (or another one required for their type)."
                slotProps={{
                  select: {
                    multiple: true,
                    displayEmpty: true,
                    renderValue: (selected) => (selected.length ? selected.map(donorTypeName).join(', ') : 'Not required (optional)'),
                  },
                  inputLabel: { shrink: true },
                }}
              >
                {donorTypes
                  .filter((d) => d.status === 'ACTIVE' || form.requiredForDonorTypeIds.includes(String(d.id)))
                  .map((d) => (
                    <MenuItem key={d.id} value={String(d.id)}>
                      <Checkbox size="small" checked={form.requiredForDonorTypeIds.includes(String(d.id))} sx={{ py: 0, pl: 0 }} />
                      {d.name}
                    </MenuItem>
                  ))}
              </TextField>
              {editing ? null : (
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
              {saveError ? <Alert severity="error">{saveError.message || 'Could not save the document type.'}</Alert> : null}
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2.5, pt: 1 }}>
            <Button onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={!form.name.trim() || !form.allowedFundSourceDomiciles.length || saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Save Document Type'}
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
