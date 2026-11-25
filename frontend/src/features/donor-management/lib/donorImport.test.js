import { describe, expect, it } from 'vitest';
import { readImportFile, rowsToCsv, templateCsv } from './donorImport.js';

describe('donor import file', () => {
  it('template reads back into rows', () => {
    const { rows, error } = readImportFile(templateCsv());
    expect(error).toBeNull();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ rowNumber: 2, donorCode: null, donorType: 'Corporate CSR', idType: 'PAN Card', contactName: 'Asha Rao', city: 'Mumbai' });
    expect(rows[1]).toMatchObject({ fundSourceDomicile: 'Foreign', foreignCountry: 'United Kingdom', idType: null });
    expect(readImportFile(rowsToCsv(rows)).rows).toEqual(rows);
  });

  it('needs the required columns', () => {
    expect(readImportFile('donor_name,email\nA,a@x.org\n').error).toMatch(
      /Missing columns: donor_type, fund_source_domicile, contact_name, contact_email, address/,
    );
  });
});
