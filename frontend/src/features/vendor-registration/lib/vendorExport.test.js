import { describe, expect, it } from 'vitest';
import { VENDOR_EXPORT_HEADERS, vendorsCsv } from './vendorExport.js';

describe('vendor export', () => {
  it('every field in full; long numbers kept as text for Excel', () => {
    const lines = vendorsCsv([
      {
        vendorCode: 'VEN-001', legalName: 'GreenAir, Instruments', entityType: 'Company', panNumber: 'AABCG1234K',
        aadhaarNumber: null, accountNumber: '012345678901234567', ifscCode: 'HDFC0001234', phoneNumber: '02240001000',
        pincode: '400001', hasGstRegistration: 'Yes', gstNumber: '27AABCG1234K1Z5',
      },
    ]).split('\r\n');
    expect(lines[0]).toBe(VENDOR_EXPORT_HEADERS.join(','));
    expect(VENDOR_EXPORT_HEADERS).toEqual(expect.arrayContaining(['account_number', 'ifsc_code', 'pan_number', 'aadhaar_number']));
    const cells = lines[1];
    expect(cells).toContain('VEN-001,"GreenAir, Instruments",Company,,Active,');
    expect(cells).toContain('AABCG1234K');
    expect(cells).toContain('"=""012345678901234567"""'); // full account number, as text
    expect(cells).toContain('"=""02240001000"""'); // landline keeps its leading 0
    expect(cells).toContain('HDFC0001234');
  });
});
