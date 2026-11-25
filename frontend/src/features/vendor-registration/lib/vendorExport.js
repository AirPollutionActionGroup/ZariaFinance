/**
 * Vendor register → CSV: every vendor field, in full — including bank account,
 * PAN and Aadhaar numbers, so the file is confidential. Account, Aadhaar and
 * phone numbers are kept as text, so Excel doesn't turn them into 1.2E+17 or
 * drop leading zeros.
 */
import { toCsv } from '../../../lib/export/csv.js';

const COLUMNS = [
  ['vendor_code', 'vendorCode'],
  ['legal_name', 'legalName'],
  ['entity_type', 'entityType'],
  ['vendor_category', 'vendorCategory'],
  ['status', (v) => v.status || 'Active'],
  ['related_party', 'relatedParty'],
  ['pan_number', 'panNumber'],
  ['aadhaar_number', 'aadhaarNumber', { asText: true }],
  ['has_gst_registration', 'hasGstRegistration'],
  ['gst_number', 'gstNumber'],
  ['gst_registration_type', 'gstRegistrationType'],
  ['tan_number', 'tanNumber'],
  ['tds_section', 'tdsSection'],
  ['has_msme_registration', 'hasMsmeRegistration'],
  ['udyam_number', 'udyamNumber'],
  ['enterprise_classification', 'enterpriseClassification'],
  ['has_incorporation_certificate', 'hasIncorporationCertificate'],
  ['date_of_incorporation', 'dateOfIncorporation'],
  ['registration_no', 'registrationNo'],
  ['bank_name', 'bankName'],
  ['branch_name', 'branchName'],
  ['account_holder_name', 'accountHolderName'],
  ['account_number', 'accountNumber', { asText: true }],
  ['ifsc_code', 'ifscCode'],
  ['payment_mode', 'paymentMode'],
  ['contact_name', 'contactName'],
  ['phone_number', 'phoneNumber', { asText: true }],
  ['contact_email', 'contactEmail'],
  ['registered_address', 'registeredAddress'],
  ['state', 'state'],
  ['pincode', 'pincode', { asText: true }],
  ['created_at', 'createdAt'],
  ['updated_at', 'updatedAt'],
];

export const VENDOR_EXPORT_HEADERS = COLUMNS.map(([header]) => header);

export function vendorsCsv(vendors) {
  return toCsv(
    COLUMNS.map(([header, field, opts]) => ({
      header,
      value: typeof field === 'function' ? field : (v) => v[field] ?? '',
      ...(opts || {}),
    })),
    vendors,
  );
}
