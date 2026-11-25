/**
 * Donor CSV import — its columns and template. Reading, the error report and
 * the edited file come from the shared CSV import helpers.
 */
import * as csvImport from '../../../lib/import/csvImport.js';

/** Template columns, in order, with the request field each one fills. */
export const IMPORT_COLUMNS = [
  { header: 'donor_code', field: 'donorCode', hint: 'Leave blank to get the next DNR-CD-nnn' },
  { header: 'donor_name', field: 'donorName', required: true, hint: 'Organisation or person' },
  { header: 'donor_type', field: 'donorType', required: true, hint: 'Corporate CSR, Individual, Foundation or Government' },
  {
    header: 'fund_source_domicile', field: 'fundSourceDomicile', required: true, hint: 'Domestic or Foreign — sets Book (LC / FC) and FCRA',
    options: ['Domestic', 'Foreign'],
  },
  { header: 'id_type', field: 'idType', hint: 'Domestic: required, e.g. PAN Card, GST Number, Aadhaar Card' },
  { header: 'id_number', field: 'idNumber', hint: 'Domestic: required — an ID number already on a donor is blocked' },
  { header: 'email', field: 'email', required: true, hint: 'Donor’s main email' },
  { header: 'phone', field: 'phone', hint: '' },
  { header: 'website', field: 'website', hint: '' },
  { header: 'contact_name', field: 'contactName', required: true, hint: 'Point of contact (primary) — add more on the donor page' },
  { header: 'contact_email', field: 'contactEmail', required: true, hint: 'Point of contact’s email' },
  { header: 'contact_phone', field: 'contactPhone', hint: '' },
  { header: 'address', field: 'address', required: true, hint: 'Street address' },
  { header: 'address2', field: 'address2', hint: '' },
  { header: 'country', field: 'country', hint: 'Country name — blank with a state means India' },
  { header: 'state', field: 'state', hint: 'State name, e.g. Maharashtra' },
  { header: 'city', field: 'city', hint: 'City in that state, e.g. Mumbai' },
  { header: 'postal_code', field: 'postalCode', hint: '' },
  { header: 'registration_number', field: 'registrationNumber', hint: 'Registration / incorporation no.' },
  { header: 'foreign_fund_source_type', field: 'foreignFundSourceType', hint: 'Foreign only, e.g. Foreign Foundation' },
  { header: 'foreign_country', field: 'foreignCountry', hint: 'Foreign only — the donor’s country' },
  { header: 'passport_id', field: 'passportId', hint: 'Foreign individual: required (up to 9 characters)' },
];

/** The template: one domestic company, one foreign foundation. */
export function templateCsv() {
  return csvImport.templateCsv(IMPORT_COLUMNS, [
    {
      donorName: 'Greenline Power Ltd', donorType: 'Corporate CSR', fundSourceDomicile: 'Domestic', idType: 'PAN Card',
      idNumber: 'ABCDE1234F', email: 'csr@greenline.example', phone: '022 4000 1000', contactName: 'Asha Rao',
      contactEmail: 'asha.rao@greenline.example', contactPhone: '+91 98200 11111', address: '12 Nariman Point',
      state: 'Maharashtra', city: 'Mumbai', postalCode: '400021',
    },
    {
      donorName: 'Clear Air Foundation', donorType: 'Foundation', fundSourceDomicile: 'Foreign', email: 'grants@clearair.example',
      website: 'clearair.example', contactName: 'Jo Smith', contactEmail: 'jo@clearair.example', address: '5 High Street, London',
      country: 'United Kingdom', registrationNumber: 'UK-CH-889911', foreignFundSourceType: 'Foreign Foundation',
      foreignCountry: 'United Kingdom',
    },
  ]);
}

export const readImportFile = (text) => csvImport.readImportFile(text, IMPORT_COLUMNS);
export const errorReportCsv = (results, sourceRows) => csvImport.errorReportCsv(IMPORT_COLUMNS, results, sourceRows);
export const rowsToCsv = (rows) => csvImport.rowsToCsv(IMPORT_COLUMNS, rows);
