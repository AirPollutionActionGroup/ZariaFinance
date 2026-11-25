import { Alert, Box, Button, Chip, Grid, IconButton, Radio, Stack, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useFieldArray, useFormState, useWatch } from 'react-hook-form';
import { RhfTextField } from '../../../shared/components/index.js';
import { MAX_CONTACTS, emptyContact } from '../lib/donorContacts.js';

/**
 * Points of contact on the donor form: one row per person (name, email,
 * phone), one marked primary. Rows can be added (up to 10) and removed (one
 * always stays); removing the primary makes the first remaining row primary.
 */
export function DonorContactsField({ control, setValue }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'contacts', keyName: 'key' });
  const contacts = useWatch({ control, name: 'contacts' }) || [];
  const { errors } = useFormState({ control, name: 'contacts' });
  const listError = errors.contacts?.message || errors.contacts?.root?.message;

  const makePrimary = (index) => {
    contacts.forEach((_, i) => setValue(`contacts.${i}.isPrimary`, i === index, { shouldDirty: true }));
  };
  const removeRow = (index) => {
    const wasPrimary = contacts[index]?.isPrimary;
    remove(index);
    if (wasPrimary) setValue('contacts.0.isPrimary', true, { shouldDirty: true });
  };

  return (
    <Stack spacing={1.5}>
      {fields.map((field, index) => {
        const primary = Boolean(contacts[index]?.isPrimary);
        return (
          <Box
            key={field.key}
            data-testid="poc-row"
            sx={{
              p: 1.5,
              pt: 2,
              borderRadius: 2,
              border: '1px solid',
              borderColor: primary ? 'success.main' : 'divider',
              bgcolor: primary ? 'var(--ok-bg)' : 'transparent',
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Contact {index + 1}
              </Typography>
              {primary ? <Chip size="small" color="success" label="Primary" /> : null}
              <Box sx={{ flex: 1 }} />
              <Stack
                direction="row"
                component="label"
                sx={{ alignItems: 'center', cursor: 'pointer', color: primary ? 'success.main' : 'text.secondary' }}
              >
                <Radio
                  size="small"
                  checked={primary}
                  onChange={() => makePrimary(index)}
                  inputProps={{ 'aria-label': `Make contact ${index + 1} primary` }}
                />
                <Typography variant="body2">Primary</Typography>
              </Stack>
              <Tooltip title={fields.length === 1 ? 'A donor needs at least one point of contact' : 'Remove this contact'}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => removeRow(index)}
                    disabled={fields.length === 1}
                    aria-label={`Remove contact ${index + 1}`}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RhfTextField name={`contacts.${index}.name`} control={control} label="Name" required />
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }}>
                <RhfTextField name={`contacts.${index}.email`} control={control} label="Email" type="email" required />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <RhfTextField name={`contacts.${index}.phone`} control={control} label="Phone number" />
              </Grid>
            </Grid>
          </Box>
        );
      })}
      {listError ? <Alert severity="error">{listError}</Alert> : null}
      <Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => append(emptyContact(false))}
          disabled={fields.length >= MAX_CONTACTS}
        >
          Add contact
        </Button>
        {fields.length >= MAX_CONTACTS ? (
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
            Up to {MAX_CONTACTS} contacts
          </Typography>
        ) : null}
      </Box>
    </Stack>
  );
}
