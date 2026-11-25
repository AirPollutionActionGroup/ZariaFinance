import { describe, expect, it } from 'vitest';
import { agreementActions, codeSortValue, countByStage, matchesSearch } from './fundingRecords.js';
import { fromFundingListItem } from '../mappers/fundingMapper.js';

const item = (extra = {}) =>
  fromFundingListItem({
    profileId: 1,
    profileCode: 'FP-2026-001',
    donorId: 10,
    donorName: 'Clean Air Trust',
    title: 'Monitoring network',
    fundClass: 'CLASS_A_RESTRICTED',
    committed: 500,
    hasSchedule: true,
    stage: 'TERMS',
    ...extra,
  });

describe('countByStage', () => {
  it('counts records per stage, every stage present', () => {
    const records = [item(), item({ profileId: 2, stage: 'COMPLETED' })];
    expect(countByStage(records)).toMatchObject({ terms: 1, completed: 1, approved: 0, pending: 0, onhold: 0 });
  });
});

describe('matchesSearch', () => {
  it('matches codes, donor and title case-insensitively', () => {
    const record = item();
    expect(matchesSearch(record, 'clean air')).toBe(true);
    expect(matchesSearch(record, 'fp-2026-001')).toBe(true);
    expect(matchesSearch(record, 'monitoring')).toBe(true);
    expect(matchesSearch(record, 'nothing')).toBe(false);
    expect(matchesSearch(record, '  ')).toBe(true);
    // An agreement's number from before GA-{FY}-{nnn} still finds it.
    const renumbered = item({ grantCode: 'GA-2026-27-021', legacyCode: 'ZRY/GA/2026/021' });
    expect(matchesSearch(renumbered, 'ZRY/GA/2026/021')).toBe(true);
    expect(matchesSearch(renumbered, 'ga-2026-27-021')).toBe(true);
  });
});

describe('codeSortValue', () => {
  it('orders by profile code, else grant code', () => {
    expect(codeSortValue(item({ profileCode: 'FP-2026-014' }))).toBe(2026 * 1_000_000 + 14);
    expect(codeSortValue(item({ profileId: null, profileCode: null, grantId: 7, grantCode: 'GA-2026-27-007' }))).toBe(
      2026 * 1_000_000 + 7,
    );
  });
});

describe('agreementActions — the status steps open to an agreement', () => {
  it.each([
    // [isApproved, isActive, expected]
    [2, true, ['approve']],
    [2, false, ['approve']],
    [1, true, ['hold', 'complete', 'close']],
    [1, false, ['activate']],
    [3, true, ['resume']],
    [3, false, ['resume']],
    [4, true, []],
    [undefined, true, []],
  ])('isApproved=%s isActive=%s → %j', (isApproved, isActive, expected) => {
    expect(agreementActions(isApproved, isActive)).toEqual(expected);
  });
});
