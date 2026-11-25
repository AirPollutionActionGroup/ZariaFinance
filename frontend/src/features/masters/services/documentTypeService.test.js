import { describe, expect, it } from 'vitest';
import { documentTypeAppliesTo, requiredDocumentTypes } from './documentTypeService.js';

const types = [
  { id: 1, name: 'PAN Card', allowedFundSourceDomiciles: ['DOMESTIC'], requiredForDonorTypeIds: [1, 2] },
  { id: 2, name: 'GST Number', allowedFundSourceDomiciles: ['DOMESTIC', 'FOREIGN'], requiredForDonorTypeIds: [1] },
  { id: 3, name: 'Passport ID', allowedFundSourceDomiciles: ['DOMESTIC', 'FOREIGN'], requiredForDonorTypeIds: [] },
];

describe('documentTypeAppliesTo', () => {
  it('offers a type only to its domicile(s)', () => {
    expect(documentTypeAppliesTo(types[0], 'DOMESTIC')).toBe(true);
    expect(documentTypeAppliesTo(types[0], 'FOREIGN')).toBe(false);
    expect(documentTypeAppliesTo(types[1], 'FOREIGN')).toBe(true);
  });

  it('offers every type before a domicile is chosen', () => {
    expect(documentTypeAppliesTo(types[0], '')).toBe(true);
  });
});

describe('requiredDocumentTypes', () => {
  it('lists the types required for the donor type', () => {
    expect(requiredDocumentTypes(types, 1, 'DOMESTIC').map((t) => t.name)).toEqual(['PAN Card', 'GST Number']);
    expect(requiredDocumentTypes(types, '2', 'DOMESTIC').map((t) => t.name)).toEqual(['PAN Card']);
  });

  it('leaves out types not offered to the domicile', () => {
    expect(requiredDocumentTypes(types, 1, 'FOREIGN').map((t) => t.name)).toEqual(['GST Number']);
    expect(requiredDocumentTypes(types, 2, 'FOREIGN')).toEqual([]);
  });

  it('requires nothing without a donor type, or for a type with no requirements', () => {
    expect(requiredDocumentTypes(types, '', 'DOMESTIC')).toEqual([]);
    expect(requiredDocumentTypes(types, 9, 'DOMESTIC')).toEqual([]);
  });
});
