import { describe, expect, it } from 'vitest';
import { fromFundingListItem, toFormErrors, toFundingRequest } from './fundingMapper.js';
import { toFundProfileFormValues } from '../../donor-management/mappers/fundProfileMapper.js';

const baseValues = {
  donorId: '12',
  fundMode: 'UNRESTRICTED',
  fundClass: 'CLASS_C_UNRESTRICTED',
  programmeTied: false,
  purpose: 'Outreach',
  disbursementType: 'TRANCHES',
  totalAmount: '885000',
  frequency: 'QUARTERLY',
  tranches: [
    { amount: '531000', fcAmount: '6000', expectedReleaseDate: '2026-12-01', isFinal: false, criteria: [] },
    { amount: '354000', fcAmount: '4000', expectedReleaseDate: '2027-03-01', isFinal: true, criteria: [] },
  ],
  fcActive: true,
  fcCurrency: 'USD',
  fcAmount: '10000',
  fcRate: '88.5',
  fcRateDate: '2026-11-11',
  fcRateSource: 'FBIL',
  withAgreement: true,
  agreement: { agreementDate: '2026-11-10', startDate: '2026-12-01', endDate: '2027-11-30', description: '', agreementDocumentPath: 'a.pdf' },
};

describe('toFundingRequest', () => {
  it('sends donor, terms with the FC block, and the agreement', () => {
    const request = toFundingRequest(baseValues);
    expect(request.donorId).toBe(12);
    expect(request.terms.disbursementRules[0]).toMatchObject({
      totalAmount: 885000,
      currency: 'USD',
      foreignAmount: 10000,
      fxRate: 88.5,
      fxRateDate: '2026-11-11',
      fxRateSource: 'FBIL',
    });
    expect(request.terms.disbursementRules[0].trancheCriteria.map((t) => t.foreignAmount)).toEqual([6000, 4000]);
    expect(request.agreement).toEqual({
      agreementDate: '2026-11-10',
      startDate: '2026-12-01',
      endDate: '2027-11-30',
      description: null,
      agreementDocumentPath: 'a.pdf',
    });
  });

  it('sends no FC block for a domestic donor, and no agreement when added later', () => {
    const request = toFundingRequest({ ...baseValues, fcActive: false, withAgreement: false });
    expect(request.terms.disbursementRules[0]).toMatchObject({ currency: null, foreignAmount: null, fxRate: null });
    expect(request.terms.disbursementRules[0].trancheCriteria.every((t) => t.foreignAmount === null)).toBe(true);
    expect(request.agreement).toBeNull();
  });

  it('counts a typed-over or unknown rate source as MANUAL', () => {
    const request = toFundingRequest({ ...baseValues, fcRateSource: 'SEED' });
    expect(request.terms.disbursementRules[0].fxRateSource).toBe('MANUAL');
  });

  it('gives a lump sum the whole foreign amount', () => {
    const request = toFundingRequest({ ...baseValues, disbursementType: 'LUMP_SUM', receivingDate: '2026-12-01', lumpSumCriteria: [] });
    expect(request.terms.disbursementRules[0].trancheCriteria).toHaveLength(1);
    expect(request.terms.disbursementRules[0].trancheCriteria[0].foreignAmount).toBe(10000);
  });
});

describe('geographies with cities', () => {
  it('sends a whole state as { stateId } and a state narrowed to cities as one row per city', () => {
    const request = toFundingRequest({
      ...baseValues,
      selectedGeographies: [27, '7'],
      selectedCities: ['27:101', '27:102', '9:500'], // 9 isn't selected → ignored
    });
    expect(request.terms.geographies).toEqual([
      { stateId: 27, cityId: 101 },
      { stateId: 27, cityId: 102 },
      { stateId: 7 },
    ]);
  });

  it('sends no geographies for "All" or nothing selected', () => {
    expect(toFundingRequest({ ...baseValues, selectedGeographies: ['ALL'], selectedCities: ['27:101'] }).terms.geographies).toEqual([]);
    expect(toFundingRequest({ ...baseValues, selectedGeographies: [] }).terms.geographies).toEqual([]);
  });

  it('sends who is saving and the optional reason for the change history', () => {
    expect(toFundingRequest(baseValues, { actor: 'Ravi', changeNote: 'Signed copy received' })).toMatchObject({
      actor: 'Ravi',
      changeNote: 'Signed copy received',
    });
    expect(toFundingRequest(baseValues, { actor: '', changeNote: '  ' })).toMatchObject({ actor: null, changeNote: null });
    expect(toFundingRequest(baseValues)).toMatchObject({ actor: null, changeNote: null });
  });

  it('loads saved rows back as one entry per state plus its cities', () => {
    const values = toFundProfileFormValues({
      geographies: [
        { stateId: 27, cityId: 101 },
        { stateId: 27, cityId: 102 },
        { stateId: 7, cityId: null },
      ],
    });
    expect(values.selectedGeographies).toEqual([27, 7]);
    expect(values.selectedCities).toEqual(['27:101', '27:102']);
  });
});

describe('tranche identity', () => {
  const saved = (type, tranches) => ({
    fundMode: 'UNRESTRICTED',
    disbursementRules: [{ id: 5, disbursementType: type, totalAmount: 1000, trancheCriteria: tranches }],
  });

  it('sends saved rule and tranche ids back, so the server keeps them (and their codes)', () => {
    const values = toFundProfileFormValues(
      saved('TRANCHES', [
        { id: 11, trancheCode: 'FP-2026-001-T1', amountCriteria: 600, expectedReleaseDate: '2026-12-01', criteria: [] },
        { id: 12, trancheCode: 'FP-2026-001-T2', amountCriteria: 400, expectedReleaseDate: '2027-03-01', criteria: [] },
      ]),
    );
    expect(values.tranches.map((t) => t.trancheCode)).toEqual(['FP-2026-001-T1', 'FP-2026-001-T2']);
    const request = toFundingRequest({ ...baseValues, ...values, fcActive: false, donorId: '1' });
    expect(request.terms.disbursementRules[0].id).toBe(5);
    expect(request.terms.disbursementRules[0].trancheCriteria.map((t) => t.id)).toEqual([11, 12]);
  });

  it('keeps a saved lump sum tranche by id; a new tranche is sent without one', () => {
    const values = toFundProfileFormValues(
      saved('LUMP_SUM', [{ id: 21, trancheCode: 'FP-2026-001-T1', amountCriteria: 1000, criteria: [] }]),
    );
    expect(values.lumpSumTrancheCode).toBe('FP-2026-001-T1');
    const lump = toFundingRequest({ ...baseValues, ...values, fcActive: false, donorId: '1' });
    expect(lump.terms.disbursementRules[0].trancheCriteria[0].id).toBe(21);

    const fresh = toFundingRequest({ ...baseValues, fcActive: false }); // tranches typed in, never saved
    expect(fresh.terms.disbursementRules[0].trancheCriteria.every((t) => t.id === null)).toBe(true);
    expect(fresh.terms.disbursementRules[0].id).toBeNull();
  });
});

describe('fromFundingListItem', () => {
  it('maps the server stage and class; an agreement without a profile has no page', () => {
    expect(fromFundingListItem({ profileId: 4, fundClass: 'CLASS_B_UNRESTRICTED', stage: 'ON_HOLD', committed: '10' }))
      .toMatchObject({ key: 'fp-4', href: '/funding/4', classCode: 'B', stage: 'onhold', committed: 10 });
    expect(fromFundingListItem({ grantId: 3, fundClass: 'B', stage: 'PENDING' }))
      .toMatchObject({ key: 'ga-3', href: null, classCode: 'B', stage: 'pending' });
  });
});

describe('toFormErrors', () => {
  it('maps server paths onto the form fields', () => {
    const { fieldErrors, otherMessages } = toFormErrors(
      {
        'terms.purpose': 'p',
        'terms.geographies': 'g',
        'terms.disbursementRules.0.currency': 'c',
        'terms.disbursementRules.0.totalAmount': 't',
        'terms.disbursementRules.0.trancheCriteria': 'over',
        'terms.disbursementRules.0.trancheCriteria.1.foreignAmount': 'f',
        'agreement.endDate': 'e',
        donorId: 'd',
        'something.else': 'x',
      },
      baseValues,
    );
    expect(fieldErrors).toEqual({
      purpose: 'p',
      selectedGeographies: 'g',
      fcCurrency: 'c',
      totalAmount: 't',
      tranches: 'over',
      'tranches.1.fcAmount': 'f',
      'agreement.endDate': 'e',
      donorId: 'd',
    });
    expect(otherMessages).toEqual(['x']);
  });

  it('sends a lump sum’s tranche errors to its criteria', () => {
    const { fieldErrors } = toFormErrors(
      {
        'terms.disbursementRules.0.trancheCriteria': 'need one',
        'terms.disbursementRules.0.trancheCriteria.0.criteria.0.milestoneName': 'm',
      },
      { disbursementType: 'LUMP_SUM' },
    );
    expect(fieldErrors).toEqual({ lumpSumCriteria: 'need one', 'lumpSumCriteria.0.milestoneName': 'm' });
  });
});
