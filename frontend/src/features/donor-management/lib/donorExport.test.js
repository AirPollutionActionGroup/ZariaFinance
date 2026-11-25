import { describe, expect, it } from 'vitest';
import { donorsCsv, otherContacts } from './donorExport.js';
import { readImportFile } from './donorImport.js';

const donor = {
  donorCode: 'DNR-CD-001',
  donorName: 'Greenline, Power Ltd',
  donorTypeName: 'Corporate CSR',
  fundSourceDomicile: 'DOMESTIC',
  book: 'LC',
  fcraApplicable: false,
  documentTypeId: 3,
  documentNumber: 'ABCDE1234F',
  email: 'csr@greenline.test',
  address: '12 Nariman Point',
  stateName: 'Maharashtra',
  cityName: 'Mumbai',
  isActive: true,
  contacts: [
    { id: 2, name: 'Ravi', email: 'ravi@greenline.test', phone: null, isPrimary: false },
    { id: 1, name: 'Asha Rao', email: 'asha@greenline.test', phone: '+91 98200', isPrimary: true },
  ],
  createdAt: '2026-11-20T10:00:00',
};

describe('donor export', () => {
  it('uses the import template layout, so the file can be imported again', () => {
    const csv = donorsCsv([donor], (id) => (id === 3 ? 'PAN Card' : ''));
    const [header] = csv.split('\r\n');
    expect(header).toMatch(/^donor_code,donor_name,donor_type,fund_source_domicile,id_type,id_number,email,/);
    expect(header).toMatch(/,status,book,fcra_applicable,other_contacts,created_at,updated_at$/);
    const { rows, error } = readImportFile(csv);
    expect(error).toBeNull();
    expect(rows[0]).toMatchObject({
      donorCode: 'DNR-CD-001',
      donorName: 'Greenline, Power Ltd',
      fundSourceDomicile: 'Domestic',
      idType: 'PAN Card',
      contactName: 'Asha Rao',
      contactPhone: '+91 98200',
      state: 'Maharashtra',
      city: 'Mumbai',
    });
  });

  it('guards a formula-looking value in the file, and the importer reads it back unchanged', () => {
    const csv = donorsCsv([{ ...donor, donorName: '=HYPERLINK("http://x","Click")' }]);
    expect(csv.split('\r\n')[1]).toContain(`"'=HYPERLINK(""http://x"",""Click"")"`);
    expect(readImportFile(csv).rows[0].donorName).toBe('=HYPERLINK("http://x","Click")');
  });

  it('lists the contacts other than the primary', () => {
    expect(otherContacts(donor)).toBe('Ravi <ravi@greenline.test>');
    expect(otherContacts({ contacts: [] })).toBe('');
  });
});
