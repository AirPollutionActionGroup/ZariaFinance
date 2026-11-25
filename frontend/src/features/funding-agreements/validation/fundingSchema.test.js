import { describe, expect, it } from 'vitest';
import { fundingFormDefaults, fundingSchema } from './fundingSchema.js';
import { emptyCriterion } from '../../donor-management/mappers/disbursementMapper.js';

const valid = {
  ...fundingFormDefaults,
  donorId: '4',
  // Restricted (the default) is programme-tied, so it needs a programme.
  fundClass: 'CLASS_A_RESTRICTED',
  programmeId: '7',
  totalAmount: '100000',
  receivingDate: '2026-12-01',
  lumpSumCriteria: [{ ...emptyCriterion(), criterionType: 'ON_SIGNING' }],
  agreement: {
    ...fundingFormDefaults.agreement,
    agreementDate: '2026-11-01',
    startDate: '2026-12-01',
    endDate: '2027-11-30',
    agreementDocumentPath: 'signed-agreement.pdf',
  },
};

const paths = (values) => {
  const result = fundingSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('fundingSchema', () => {
  it('requires a complete release criterion for a lump sum', () => {
    expect(paths({ ...valid, lumpSumCriteria: [] })).toEqual(['lumpSumCriteria']);
    expect(paths({ ...valid, lumpSumCriteria: [emptyCriterion()] })).toEqual(['lumpSumCriteria.0.criterionType']);
  });

  it('accepts complete terms + agreement', () => {
    expect(paths(valid)).toEqual([]);
  });

  it('requires a donor and the fund-profile rules', () => {
    expect(paths({ ...valid, donorId: '', fundClass: '' })).toEqual(expect.arrayContaining(['donorId', 'fundClass']));
    // fundProfileSchema's cross-field rules run once its basic fields are valid.
    expect(paths({ ...valid, totalAmount: '' })).toEqual(['totalAmount']);
  });

  it('validates the agreement only when it is being recorded now', () => {
    const blank = { ...valid, agreement: fundingFormDefaults.agreement };
    expect(paths(blank)).toEqual(
      expect.arrayContaining(['agreement.agreementDate', 'agreement.startDate', 'agreement.agreementDocumentPath']),
    );
    expect(paths({ ...blank, withAgreement: false })).toEqual([]);
  });

  it('rejects an end date before the start date', () => {
    expect(paths({ ...valid, agreement: { ...valid.agreement, endDate: '2026-01-01' } })).toEqual(['agreement.endDate']);
  });
});
