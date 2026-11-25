import { GeographyFields } from './GeographyFields.jsx';
import { DonorContactsField } from './DonorContactsField.jsx';
import { Alert, Button, Card, CardContent, Grid, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { RhfSelect, RhfTextField } from '../../../shared/components/index.js';
import { applyServerErrors } from '../../../lib/forms/applyServerErrors.js';
import { donorSchema, donorFormDefaults } from '../validation/donorSchema.js';
import { FUND_SOURCE_DOMICILE, toOptions } from '../constants.js';
import { documentTypeAppliesTo, documentTypeService, requiredDocumentTypes } from '../../masters/services/documentTypeService.js';
import { donorService } from '../services/donorService.js';
import { useState, useEffect } from 'react';
import { geographyService } from '../services/geographyService.js';
import { donorTypeService } from '../services/donorTypeService.js';

/*
 * ID types come from the Document Type master (by id; known ones such as PAN Card are matched by name). The
 * six built-in codes keep their tailored label / hint / length; any type added
 * in Master Configuration gets a generic "<name> number" field.
 */
/** Lower-case letters and digits of a name: "PAN Card" → "pancard" — how the known types are recognised. */
const nameKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const ID_FIELD = {
  pancard: { label: 'PAN Card Number', placeholder: 'e.g. ABCDE1234F (10 chars)', maxLength: 10, upper: true },
  aadhaarcard: { label: 'Aadhaar Number', placeholder: '12-digit Aadhaar number', maxLength: 12, digits: true },
  voterid: { label: 'Voter ID Number', placeholder: 'e.g. ABC1234567', upper: true },
  drivinglicense: { label: 'Driving License Number', placeholder: 'e.g. DL-1420110012345', upper: true },
  passportid: { label: 'Passport ID', placeholder: 'e.g. A12345678 (9 chars)', maxLength: 9, upper: true },
  foreigntaxidentificationnumber: { label: 'Foreign Tax Identifier', placeholder: 'e.g. SSN / Tax ID', maxLength: 15 },
};
const isPassport = (type) => nameKey(type?.name).startsWith('passport');

function idField(typeName) {
  if (ID_FIELD[nameKey(typeName)]) return ID_FIELD[nameKey(typeName)];
  // "GST Number" stays "GST Number"; "CIN Certificate" becomes "CIN Certificate number".
  const label = !typeName
    ? 'ID number'
    : /\b(number|no\.?|id)$/i.test(typeName.trim())
      ? typeName.trim()
      : `${typeName.trim()} number`;
  return { label, placeholder: label, upper: true };
}

function idSlotProps(field) {
  return {
    htmlInput: {
      ...(field.maxLength ? { maxLength: field.maxLength } : {}),
      ...(field.upper ? { style: { textTransform: 'uppercase' } } : {}),
    },
  };
}

/** Aadhaar keeps digits only; other numbers keep letters and digits, upper-cased. */
const formatIdNumber = (field, value) =>
  field.digits ? value.replace(/\D/g, '') : value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

export function DonorForm({ mode, defaultValues, onSubmit, submitting, submitError, onCancel }) {
  const { control, handleSubmit, setError, watch, setValue } = useForm({
    resolver: zodResolver(donorSchema),
    defaultValues: defaultValues || donorFormDefaults,
  });

  const donorTypeId = watch('donorType');
  const idType = watch('idType');
  const fundSourceDomicile = watch('fundSourceDomicile');
  const [foreignCountries, setForeignCountries] = useState([]);
  const [donorTypes, setDonorTypes] = useState([]);

  // New donor: fill in the next free donor code (DNR-CD-nnn); the user can still change it.
  useEffect(() => {
    if (mode === 'edit') return;
    donorService
      .nextDonorCode()
      .then((code) => {
        if (code) setValue('donorCode', code, { shouldValidate: true });
      })
      .catch((err) => console.error('Error loading next donor code', err));
  }, [mode, setValue]);

  // Donor types are a manageable master (see Master Configuration) — load the
  // active ones for the dropdown instead of a hardcoded list.
  useEffect(() => {
    donorTypeService
      .listActiveDonorTypes()
      .then(setDonorTypes)
      .catch((err) => console.error('Error loading donor types', err));
  }, []);

  // ID types are the Document Type master (Master Configuration → Document Type):
  // active ones are offered; an edited donor also keeps the type it already has.
  const [documentTypes, setDocumentTypes] = useState([]);
  useEffect(() => {
    documentTypeService
      .listActiveDocumentTypes()
      .then(setDocumentTypes)
      .catch((err) => console.error('Error loading document types', err));
  }, []);
  const savedIdType = defaultValues?.idType || '';
  // Document types this donor type must give (Master → Document types → "Required for").
  const requiredDocs = requiredDocumentTypes(documentTypes, donorTypeId, fundSourceDomicile);
  const requiredNames = requiredDocs.map((t) => t.name).join(' or ');
  // An edited donor that keeps both its donor type and its document isn't re-checked (as on the server).
  const unchangedOnEdit = (values) =>
    mode === 'edit' && values.idType === savedIdType && String(values.donorType) === String(defaultValues?.donorType);
  // An edited donor may keep its saved type as long as its domicile is unchanged.
  const keepsSavedType = (id) => id === savedIdType && fundSourceDomicile === defaultValues?.fundSourceDomicile;
  const idTypeOptions = (excludePassport) => {
    // Only types offered to this donor's fund source domicile (Master → Document types);
    // when the donor type requires documents, only those.
    const pool = requiredDocs.length ? requiredDocs : documentTypes;
    const list = pool.filter((t) => (!excludePassport || !isPassport(t)) && documentTypeAppliesTo(t, fundSourceDomicile));
    const options = list.map((t) => ({ value: String(t.id), label: t.name }));
    // An edited donor keeps its saved type even if that type was deactivated since.
    if (savedIdType && keepsSavedType(savedIdType) && !options.some((o) => o.value === savedIdType)) {
      options.push({ value: savedIdType, label: `${defaultValues?.idTypeName || 'Saved ID type'} (inactive)` });
    }
    return [{ value: '', label: 'Select your preference' }, ...options];
  };

  // Switching domicile (e.g. Domestic → Foreign) clears an ID type that isn't offered to the new one.
  useEffect(() => {
    if (!idType || keepsSavedType(idType)) return;
    const type = documentTypes.find((t) => String(t.id) === String(idType));
    if (type && !documentTypeAppliesTo(type, fundSourceDomicile)) {
      setValue('idType', '');
      setValue('idNumber', '');
    }
    // keepsSavedType only reads idType/fundSourceDomicile/defaultValues, covered below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundSourceDomicile, documentTypes, idType, setValue]);

  const idTypeName = documentTypes.find((t) => String(t.id) === String(idType))?.name;
  const currentIdField = idField(idTypeName);
  const onIdNumberChange = (e) => {
    const formatted = formatIdNumber(currentIdField, e.target.value);
    setValue('idNumber', formatted, { shouldValidate: true });
    if (nameKey(idTypeName) === 'pancard') setValue('panCardNumber', formatted);
    if (nameKey(idTypeName).startsWith('passport')) setValue('passportNumber', formatted);
  };

  const selectedDonorType = donorTypes.find((dt) => String(dt.id) === String(donorTypeId));
  const donorTypeOptions = donorTypes.map((dt) => ({ value: dt.id, label: dt.name }));
  const isIndividual = (selectedDonorType?.name || '').toUpperCase() === 'INDIVIDUAL';
  const isForeign = fundSourceDomicile === 'FOREIGN';

  // Fund Source Domicile is constrained by the selected donor type's allowed
  // values (see Master Configuration → Donor Type); no restriction means both.
  const allowedDomiciles = selectedDonorType?.allowedFundSourceDomiciles?.length
    ? selectedDonorType.allowedFundSourceDomiciles
    : ['DOMESTIC', 'FOREIGN'];
  const fundSourceDomicileOptions = toOptions(FUND_SOURCE_DOMICILE).filter((opt) =>
    allowedDomiciles.includes(opt.value));
  const isDomicileLocked = allowedDomiciles.length === 1;

  // When the donor type only allows one Fund Source Domicile, lock the field to it.
  useEffect(() => {
    if (isDomicileLocked) {
      setValue('fundSourceDomicile', allowedDomiciles[0]);
    }
  }, [isDomicileLocked, allowedDomiciles.join(','), setValue]);

  // Mirror the selected donor type's name into a hidden field — donorSchema's
  // Individual + foreign passport check needs the name, not the submitted id.
  useEffect(() => {
    setValue('donorTypeName', selectedDonorType?.name || '');
  }, [selectedDonorType?.name, setValue]);

  useEffect(() => {
    if (isForeign) {
      geographyService
        .listCountries()
        .then((list) =>
          setForeignCountries(
            list
              .filter((c) => c.label.trim().toUpperCase() !== 'INDIA')
              .map((c) => ({ value: c.label, label: c.label }))
          )
        )
        .catch((err) => console.error('Error loading foreign countries', err));
    }
  }, [isForeign]);

  useEffect(() => {
    setValue('fcraApplicable', isForeign);
    setValue('book', isForeign ? 'FC' : 'LC');
    if (!isForeign) {
      setValue('registrationNumber', '');
      setValue('foreignCountryId', '');
      setValue('foreignFundSourceType', '');
      setForeignCountries([]);
    }
  }, [isForeign, setValue]);

  const submit = handleSubmit(async (values) => {
    if (requiredDocs.length && !requiredDocs.some((t) => String(t.id) === String(values.idType)) && !unchangedOnEdit(values)) {
      setError('idType', { type: 'required', message: `${selectedDonorType?.name || 'This donor type'} donors need ${requiredNames}` });
      return;
    }
    try {
      if (typeof onSubmit === 'function') {
        await onSubmit(values);
      } else if (mode === 'edit') {
        await donorService.updateDonor(defaultValues?.id, values);
      } else {
        await donorService.createDonor(values);
      }
    } catch (error) {
      // The server names the backend field (documentTypeId); the form's field is idType.
      if (error?.fieldErrors?.documentTypeId && !error.fieldErrors.idType) {
        error.fieldErrors.idType = error.fieldErrors.documentTypeId;
      }
      applyServerErrors(error, setError);
    }
  });

  return (
    <Card component="form" onSubmit={submit} noValidate>
      <CardContent sx={{ p: 3 }}>
        <Stack spacing={3}>
          {submitError && !submitError.fieldErrors ? (
            <Alert severity="error">{submitError.message}</Alert>
          ) : null}

          <section>
            <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
              Identity
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <RhfTextField
                  name="donorCode"
                  control={control}
                  label="Donor code"
                  required
                  disabled={mode === 'edit'}
                  helperText={mode === 'edit' ? 'Code cannot change after creation' : 'Auto-filled with the next free code'}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 8 }}>
                <RhfTextField name="donorName" control={control} label="Donor name" required />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <RhfSelect
                  name="donorType"
                  control={control}
                  label="Donor type"
                  required
                  options={donorTypeOptions}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <RhfSelect
                  name="fundSourceDomicile"
                  control={control}
                  label="Fund source domicile"
                  required
                  disabled={isDomicileLocked}
                  helperText={
                    isDomicileLocked && selectedDonorType
                      ? `${selectedDonorType.name} is always ${allowedDomiciles[0] === 'FOREIGN' ? 'foreign' : 'domestic'}`
                      : ' '
                  }
                  options={fundSourceDomicileOptions}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="Book"
                  value={isForeign ? 'FC · Foreign contribution' : 'LC · Local contribution'}
                  disabled
                  fullWidth
                  helperText="Derived from fund source domicile"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 3 }}>
                <TextField
                  label="FCRA applicable"
                  value={isForeign ? 'Yes' : 'No'}
                  disabled
                  fullWidth
                  helperText="Derived from fund source domicile"
                />
              </Grid>

              {!isForeign ? (
                <>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RhfSelect
                      name="idType"
                      control={control}
                      label="ID type"
                      required
                      options={idTypeOptions(false)}
                      helperText={
                        requiredDocs.length
                          ? `Required for ${selectedDonorType?.name || 'this donor type'}: ${requiredNames}`
                          : 'Manage the list in Master → Document Type'
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RhfTextField
                      name="idNumber"
                      control={control}
                      label={currentIdField.label}
                      required
                      placeholder={currentIdField.placeholder}
                      slotProps={idSlotProps(currentIdField)}
                      onChange={onIdNumberChange}
                    />
                  </Grid>
                </>
              ) : null}
            </Grid>
          </section>

          {isForeign ? (
            <section>
              <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
                Foreign fund source
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RhfTextField
                    name="foreignFundSourceType"
                    control={control}
                    label="Foreign fund source type"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RhfSelect
                    name="foreignCountryId"
                    control={control}
                    label="Foreign country"
                    options={foreignCountries}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RhfTextField
                    name="registrationNumber"
                    control={control}
                    label="Registration/Incorporation Number"
                  />
                </Grid>
                {isIndividual ? (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RhfTextField
                      name="passportNumber"
                      control={control}
                      label="Passport ID"
                      required
                      placeholder="e.g. A12345678"
                      slotProps={{ htmlInput: { maxLength: 9, style: { textTransform: 'uppercase' } } }}
                      onChange={(e) => {
                        const clean = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        setValue('passportNumber', clean, { shouldValidate: true });
                      }}
                    />
                  </Grid>
                ) : null}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RhfSelect
                    name="idType"
                    control={control}
                    label="ID type"
                    required={requiredDocs.length > 0}
                    options={idTypeOptions(true)}
                    helperText={requiredDocs.length ? `Required for ${selectedDonorType?.name || 'this donor type'}: ${requiredNames}` : undefined}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RhfTextField
                    name="idNumber"
                    control={control}
                    label={currentIdField.label}
                    placeholder={currentIdField.placeholder}
                    slotProps={idSlotProps(currentIdField)}
                    onChange={onIdNumberChange}
                  />
                </Grid>
              </Grid>
            </section>
          ) : null}

          <section>
            <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
              Contact
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RhfTextField name="email" control={control} label="Email" type="email" required />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RhfTextField name="phoneNumber" control={control} label="Phone number" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RhfTextField name="website" control={control} label="Website" />
              </Grid>
            </Grid>
          </section>

          <section>
            <Typography variant="h4" component="h2" sx={{ mb: 0.5 }}>
              Point Of Contact
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              The people you deal with at this donor. The primary contact is shown first and used by default.
            </Typography>
            <DonorContactsField control={control} setValue={setValue} />
          </section>

          {/* ADDRESS SECTION */}
          <section>
            <Typography variant="h4" component="h2" sx={{ mb: 2 }}>
              Address
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RhfTextField name="address" control={control} label="Street address" required />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <RhfTextField name="address2" control={control} label="Street address 2" />
              </Grid>

              {/* DYNAMIC GEOGRAPHY FIELDS */}
              {/* Domestic locks Country to India (disabled); Foreign re-enables it. */}
              <GeographyFields
                control={control}
                setValue={setValue}
                errors={submitError?.fieldErrors}
                isDomestic={!isForeign}
              />

              <Grid size={{ xs: 6, sm: 3 }}>
                <RhfTextField name="postalCode" control={control} label="PIN / Postal code" placeholder="PIN / Postal code" />
              </Grid>
            </Grid>
          </section>

          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button color="inherit" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create donor'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
