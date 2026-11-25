import { Typography } from '@mui/material';
import { CsvImportPage } from '../../../shared/components/import/CsvImportPage.jsx';
import { useImportDonors } from '../hooks/useDonors.js';
import { IMPORT_COLUMNS, errorReportCsv, readImportFile, rowsToCsv, templateCsv } from '../lib/donorImport.js';

const isForeign = (d) => String(d.fundSourceDomicile || '').toUpperCase() === 'FOREIGN';

const SPEC = {
  noun: 'donor',
  nounPlural: 'donors',
  unit: 'donor',
  units: 'donors',
  listPath: '/donors',
  backLabel: 'Donors',
  fileSlug: 'donors',
  title: 'Import donors',
  subtitle:
    'Add many donors at once from a CSV file. Every row is checked first — nothing is saved until you import. Imported donors start inactive, like new donors from the form.',
  templateDescription:
    'One row per donor, with its primary point of contact. Donor type, ID type, country, state and city are matched by name.',
  columns: IMPORT_COLUMNS,
  templateCsv,
  readImportFile,
  errorReportCsv,
  rowsToCsv,
  hideAmount: true,
  editorLayout: [
    { field: 'donorCode', md: 3 },
    { field: 'donorName', md: 5, xs: 12 },
    { field: 'donorType', md: 2 },
    { field: 'fundSourceDomicile', md: 2 },
    { field: 'idType', md: 3 },
    { field: 'idNumber', md: 3 },
    { field: 'email', md: 3 },
    { field: 'phone', md: 3 },
    { field: 'contactName', md: 3 },
    { field: 'contactEmail', md: 3 },
    { field: 'contactPhone', md: 3 },
    { field: 'website', md: 3 },
    { field: 'address', md: 6, xs: 12 },
    { field: 'address2', md: 6, xs: 12 },
    { field: 'country', md: 3 },
    { field: 'state', md: 3 },
    { field: 'city', md: 3 },
    { field: 'postalCode', md: 3 },
    { field: 'registrationNumber', md: 3 },
    { field: 'foreignFundSourceType', md: 3, when: isForeign },
    { field: 'foreignCountry', md: 3, when: isForeign },
    { field: 'passportId', md: 3, when: isForeign },
  ],
  firstColumn: {
    header: 'Donor',
    render: (r) => (
      <>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {r.donorName || '—'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>
          {r.donorCode}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {[r.donorType, r.domicile, r.book].filter(Boolean).join(' · ')}
        </Typography>
      </>
    ),
  },
  partyHeader: 'ID · point of contact',
  renderParty: (r) => (
    <>
      <Typography variant="body2">{r.idDocument || '—'}</Typography>
      {r.contactName ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {r.contactName}
          {r.contactEmail ? ` · ${r.contactEmail}` : ''}
        </Typography>
      ) : null}
    </>
  ),
  createdLink: (r) => (r.donorId ? { label: r.donorCode, path: `/donors/${r.donorId}` } : null),
};

/** Import donors from a CSV file — /donors/import. */
export function DonorImportPage() {
  const importDonors = useImportDonors();
  return <CsvImportPage spec={SPEC} importNotes={importDonors} />;
}
