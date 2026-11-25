import { describe, expect, it } from 'vitest';
import { toCsv } from './csv.js';

describe('toCsv', () => {
  it('writes a header row and escapes commas, quotes and newlines', () => {
    const fields = [
      { header: 'Id', value: (r) => r.id },
      { header: 'Remarks', value: (r) => r.remarks },
      { header: 'Amount', value: (r) => r.amount },
    ];
    const csv = toCsv(fields, [
      { id: 'DN-1', remarks: 'Rent, June', amount: 100 },
      { id: 'DN-2', remarks: 'Said "extra"\nline two', amount: null },
    ]);
    expect(csv).toBe('Id,Remarks,Amount\r\nDN-1,"Rent, June",100\r\nDN-2,"Said ""extra""\nline two",');
  });

  it('guards values Excel would run as formulas, but leaves numbers and phone numbers alone', () => {
    const fields = [{ header: 'v', value: (r) => r.v }];
    const cells = (values) => toCsv(fields, values.map((v) => ({ v }))).split('\r\n').slice(1);
    expect(cells(['=HYPERLINK("http://x")', '@SUM(A1)', '+cmd|x', '-2+3', '+91 98200 11111', '-500', '-', 'Plain', -12.5])).toEqual([
      `"'=HYPERLINK(""http://x"")"`,
      "'@SUM(A1)",
      "'+cmd|x",
      "'-2+3",
      '+91 98200 11111',
      '-500',
      '-',
      'Plain',
      '-12.5',
    ]);
  });

  it('keeps long digit strings as text for Excel when asked', () => {
    const csv = toCsv([{ header: 'acct', value: (r) => r.a, asText: true }], [{ a: '012345678901234567' }, { a: 'AB-12' }, { a: null }]);
    expect(csv.split('\r\n')).toEqual(['acct', `"=""012345678901234567"""`, 'AB-12', '']);
  });
});
