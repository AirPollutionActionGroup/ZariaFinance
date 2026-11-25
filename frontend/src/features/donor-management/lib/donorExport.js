/**
 * Donor register → CSV. The columns follow the import template (same headers,
 * same order), so an export can be edited and imported again; then status,
 * the other points of contact and the dates.
 */
import { toCsv } from '../../../lib/export/csv.js';
import { IMPORT_COLUMNS } from './donorImport.js';

const DOMICILE = { DOMESTIC: 'Domestic', FOREIGN: 'Foreign' };

/** The primary contact (the first one, if none is marked). */
export const primaryContact = (donor) => (donor.contacts || []).find((c) => c.isPrimary) || (donor.contacts || [])[0] || null;

/** "Name <email> phone; …" for every contact except the primary. */
export function otherContacts(donor) {
  const primary = primaryContact(donor);
  return (donor.contacts || [])
    .filter((c) => c !== primary)
    .map((c) => [c.name, c.email ? `<${c.email}>` : null, c.phone].filter(Boolean).join(' '))
    .join('; ');
}

/** DonorResponse (view model) → the import template's field values. */
function templateValues(donor, documentTypeName) {
  const contact = primaryContact(donor);
  return {
    donorCode: donor.donorCode,
    donorName: donor.donorName,
    donorType: donor.donorTypeName,
    fundSourceDomicile: DOMICILE[donor.fundSourceDomicile] || donor.fundSourceDomicile,
    idType: donor.documentTypeId ? documentTypeName(donor.documentTypeId) : '',
    idNumber: donor.documentNumber,
    email: donor.email,
    phone: donor.phoneNumber,
    website: donor.website,
    contactName: contact?.name,
    contactEmail: contact?.email,
    contactPhone: contact?.phone,
    address: donor.address,
    address2: donor.address2,
    country: donor.countryName,
    state: donor.stateName,
    city: donor.cityName,
    postalCode: donor.postalCode,
    registrationNumber: donor.registrationNumber,
    foreignFundSourceType: donor.foreignFundSourceType,
    foreignCountry: donor.foreignCountryId,
    passportId: donor.passportId,
  };
}

/**
 * @param {Array} donors            donors to export (as the list shows them)
 * @param {Function} documentTypeName  document type id → name, e.g. 3 → "PAN Card"
 */
export function donorsCsv(donors, documentTypeName = (code) => code) {
  return toCsv(
    [
      ...IMPORT_COLUMNS.map((c) => ({ header: c.header, value: (d) => templateValues(d, documentTypeName)[c.field] ?? '' })),
      { header: 'status', value: (d) => (d.isActive ? 'Active' : 'Inactive') },
      { header: 'book', value: (d) => d.book || (d.fundSourceDomicile === 'FOREIGN' ? 'FC' : 'LC') },
      { header: 'fcra_applicable', value: (d) => (d.fcraApplicable ? 'Yes' : 'No') },
      { header: 'other_contacts', value: (d) => otherContacts(d) },
      { header: 'created_at', value: (d) => d.createdAt || '' },
      { header: 'updated_at', value: (d) => d.updatedAt || '' },
    ],
    donors,
  );
}
