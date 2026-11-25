import { describe, expect, it } from 'vitest';
import { buildXlsx, columnLetter, crc32 } from './xlsx.js';

/** Reads a stored (uncompressed) zip back into { name: text }. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const files = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = dec.decode(bytes.slice(at + 30, at + 30 + nameLen));
    const body = bytes.slice(at + 30 + nameLen, at + 30 + nameLen + size);
    expect(view.getUint32(at + 14, true)).toBe(crc32(body));
    files[name] = dec.decode(body);
    at += 30 + nameLen + size;
  }
  return files;
}

describe('xlsx writer', () => {
  it('column letters', () => {
    expect([0, 25, 26, 51, 701, 702].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'ZZ', 'AAA']);
  });

  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('builds a valid package with sheets, styles, formulas and escaped text', () => {
    const files = unzip(
      buildXlsx([
        {
          name: 'Lines/2026: [draft]',
          freezeRows: 1,
          autoFilter: 'A1:B4',
          merges: ['A1:B1'],
          tabColor: '1E6B4A',
          landscape: true,
          fitToWidth: true,
          columns: [{ width: 10 }, { width: 20 }],
          rows: [
            [{ v: 'Item', style: 'header' }, { v: 'Amount', style: 'header' }],
            ['Rent & <power>', { v: 1500, style: 'inr' }, { f: 'REPT("█",2)', v: '██' }],
            ['=cmd|evil', 250],
            [{ v: 'Total', style: 'bold' }, { f: 'SUM(B2:B3)', v: 1750, style: 'boldInr' }],
          ],
        },
        { name: 'History', rows: [['x']] },
      ]),
    );
    expect(Object.keys(files)).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml',
    ]);
    expect(files['xl/workbook.xml']).toContain('<sheet name="Lines 2026   draft " sheetId="1" r:id="rId1"/>');
    const sheet = files['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<autoFilter ref="A1:B4"/>');
    expect(sheet).toContain('<mergeCell ref="A1:B1"/>');
    expect(sheet).toContain('<sheetPr><tabColor rgb="FF1E6B4A"/><pageSetUpPr fitToPage="1"/></sheetPr>');
    expect(sheet).toContain('orientation="landscape" fitToWidth="1" fitToHeight="0"');
    expect(sheet).toContain('<c r="C2" t="str"><f>REPT(&quot;█&quot;,2)</f><v>██</v></c>');
    expect(files['xl/workbook.xml']).toContain(
      `<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'Lines 2026   draft '!$A$1:$B$4</definedName>`,
    );
    expect(sheet).toContain('<col min="2" max="2" width="20" customWidth="1"/>');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Rent &amp; &lt;power&gt;</t></is></c>');
    expect(sheet).toMatch(/<c r="B2" s="\d+"><v>1500<\/v><\/c>/);
    // Text that looks like a formula stays text.
    expect(sheet).toContain('<c r="A3" t="inlineStr"><is><t xml:space="preserve">=cmd|evil</t></is></c>');
    expect(sheet).toMatch(/<c r="B4" s="\d+"><f>SUM\(B2:B3\)<\/f><v>1750<\/v><\/c>/);
    expect(files['xl/styles.xml']).toContain('numFmtId="164"');
  });
});
