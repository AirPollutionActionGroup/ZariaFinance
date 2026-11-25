/**
 * FundProfileMapper — FundProfileResponse ↔ view / form models.
 *
 * The backend's disbursementRules/trancheCriteria are one level deeper and
 * differently-named than the form's flat disbursementType/totalAmount/frequency
 * + tranches[] shape (see fundProfileSchema.js / FundProfileFields.jsx): a
 * profile has at most one meaningful disbursement rule, and each
 * DonorTrancheCriterion row carries its own amount/date plus a criteria[] list
 * (a tranche can have more than one release gate — mirrors tranches[].criteria[]
 * on the form and DonorReleaseCriteria on the backend).
 *
 * A lump sum is one tranche on the wire; its release criteria are edited in
 * the form's `lumpSumCriteria[]` (required — no longer a fixed "On Signing").
 */

import { emptyCriterion } from './disbursementMapper.js';

const FUND_MODE_LABEL = { RESTRICTED: 'Restricted', UNRESTRICTED: 'Unrestricted' };

/** A/B/C restriction class → human label (distinct from the donor typology). */
export const FUND_CLASS_LABEL = {
  CLASS_A_RESTRICTED: 'Class A – Restricted',
  CLASS_B_UNRESTRICTED: 'Class B · Unrestricted w/ explanation',
  CLASS_C_UNRESTRICTED: 'Class C · Fully unrestricted',
};

/** FundProfileResponse → view model (donor detail / list display). */
export function fromFundProfileResponse(dto) {
  return {
    ...dto,
    fundModeLabel: FUND_MODE_LABEL[dto.fundMode] || dto.fundMode || '—',
    fundClassLabel: dto.fundClassLabel || FUND_CLASS_LABEL[dto.fundClass] || dto.fundClass || '—',
    geographies: dto.geographies || [],
    utilisationRules: dto.utilisationRules || [],
    disbursementRules: dto.disbursementRules || [],
  };
}

const numOrNull = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const trimOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

/** One form criterion → a ReleaseCriterionItem. */
function toReleaseCriterionItem(c) {
  return {
    id: c.id ?? null,
    releaseCriteria: c.criterionType || null,
    releaseDate: trimOrNull(c.releaseDate),
    milestoneName: trimOrNull(c.milestoneName),
    verificationSignOffRoleId: numOrNull(c.verificationRoleId),
    otherVerificationSignOffRole: trimOrNull(c.otherVerificationRole),
    targetDate: trimOrNull(c.targetDate),
    utilisationPercentage: numOrNull(c.utilisationPercent),
    triggerBasis: trimOrNull(c.triggerBasis),
    description: trimOrNull(c.description),
    remindSomeone: Boolean(c.hasReminder),
    responsibleRoleId: c.hasReminder ? numOrNull(c.reminder?.responsibleRoleId) : null,
    otherResponsibleRole: c.hasReminder ? trimOrNull(c.reminder?.otherResponsibleRole) : null,
    reminderLeadTime: c.hasReminder ? numOrNull(c.reminder?.reminderLeadDays) : null,
    repeatReminder: c.hasReminder ? (c.reminder?.repeatReminder || 'ONCE') : null,
    escalateToDeputy: c.hasReminder ? Boolean(c.reminder?.escalateToDeputy) : null,
  };
}

/** One tranche row (amount/date + all its criteria) → a trancheCriteria item. */
function toTrancheCriterionItem(t, frequency, foreign) {
  return {
    // Sent back so the server keeps this tranche (same id and code) instead of
    // replacing it — credit notes point at tranches by id.
    id: t.id ?? null,
    amountCriteria: numOrNull(t.amount),
    foreignAmount: foreign ? numOrNull(t.fcAmount) : null,
    expectedReleaseDate: trimOrNull(t.expectedReleaseDate),
    frequency: frequency || 'MONTHLY',
    isFinalTranche: Boolean(t.isFinal),
    criteria: (t.criteria || []).map(toReleaseCriterionItem),
  };
}

/** The inverse of toReleaseCriterionItem: a ReleaseCriterionItem → a form criterion. */
function toCriterionFormValue(c) {
  return {
    id: c.id ?? null,
    criterionType: c.releaseCriteria || '',
    releaseDate: c.releaseDate || '',
    milestoneName: c.milestoneName || '',
    verificationRoleId: c.verificationSignOffRoleId ?? '',
    otherVerificationRole: c.otherVerificationSignOffRole || '',
    targetDate: c.targetDate || '',
    utilisationPercent: c.utilisationPercentage ?? '',
    triggerBasis: c.triggerBasis || '',
    description: c.description || '',
    hasReminder: Boolean(c.remindSomeone),
    reminder: {
      responsibleRoleId: c.responsibleRoleId ?? '',
      otherResponsibleRole: c.otherResponsibleRole || '',
      reminderLeadDays: c.reminderLeadTime ?? '',
      repeatReminder: c.repeatReminder || 'ONCE',
      escalateToDeputy: c.escalateToDeputy ?? true,
    },
  };
}

/** The inverse of toTrancheCriterionItem: a trancheCriteria item → a tranche row. */
function toTrancheFormValue(c) {
  return {
    id: c.id ?? null,
    trancheCode: c.trancheCode || '',
    amount: c.amountCriteria ?? '',
    fcAmount: c.foreignAmount ?? '',
    expectedReleaseDate: c.expectedReleaseDate || '',
    isFinal: Boolean(c.isFinalTranche),
    criteria: (c.criteria || []).map(toCriterionFormValue),
  };
}

/** Form values → CreateFundProfileRequest. */
export function toFundProfileRequest(values) {
  const geographies = toGeographyItems(values);

  const utilisationRules = (values.utilisationRules || [])
    .filter((r) => (r.ruleType || '').trim())
    .map((r) => ({
      ruleType: r.ruleType,
      otherRuleType: r.ruleType === 'OTHER_CUSTOM' ? trimOrNull(r.otherRuleType) : null,
      limitPercentage: numOrNull(r.limitPercentage),
      description: trimOrNull(r.description),
    }));

  const disbursementActive = !isBlank(values.totalAmount) || (values.tranches || []).length > 0;
  const fc = foreignContributionOf(values);
  const disbursementRules = disbursementActive
    ? [
        {
          id: values.disbursementRuleId ?? null,
          totalAmount: numOrNull(values.totalAmount),
          disbursementType: values.disbursementType,
          receivingDate: values.disbursementType === 'LUMP_SUM' ? trimOrNull(values.receivingDate) : null,
          ...fc,
          trancheCriteria:
            values.disbursementType === 'LUMP_SUM'
              ? [
                  {
                    id: values.lumpSumTrancheId ?? null,
                    amountCriteria: numOrNull(values.totalAmount),
                    // A lump sum is the whole commitment, so in FC it is the whole foreign amount.
                    foreignAmount: fc.currency ? fc.foreignAmount : null,
                    expectedReleaseDate: trimOrNull(values.receivingDate),
                    frequency: 'MONTHLY',
                    isFinalTranche: true,
                    criteria: (values.lumpSumCriteria || []).map(toReleaseCriterionItem),
                  },
                ]
              : (values.tranches || []).map((t) => toTrancheCriterionItem(t, values.frequency, Boolean(fc.currency))),
        },
      ]
    : [];

  return {
    fundMode: values.fundMode,
    fundClass: values.fundClass || null,
    purpose: trimOrNull(values.purpose),
    programmeTied: Boolean(values.programmeTied),
    programmeId: values.programmeId ? Number(values.programmeId) : null,
    reportingFrequency: values.reportingFrequency || null,
    movementAllowed: Boolean(values.movementAllowed),
    explanationRequired: Boolean(values.explanationRequired),
    onboardingComplete: Boolean(values.onboardingComplete),
    geographies,
    utilisationRules,
    disbursementRules,
  };
}

/**
 * The FC block on the wire: all five fields, or all null for an INR commitment.
 * Sent only when the currency, amount and rate are filled in, and never when the
 * form says the donor isn't in the FC book (fcActive === false).
 */
function foreignContributionOf(values) {
  const none = { currency: null, foreignAmount: null, fxRate: null, fxRateDate: null, fxRateSource: null };
  if (values.fcActive === false) return none;
  if (!values.fcCurrency || !(Number(values.fcAmount) > 0) || !(Number(values.fcRate) > 0)) return none;
  return {
    currency: values.fcCurrency,
    foreignAmount: numOrNull(values.fcAmount),
    fxRate: numOrNull(values.fcRate),
    fxRateDate: trimOrNull(values.fcRateDate),
    fxRateSource: FX_RATE_SOURCES.includes(values.fcRateSource) ? values.fcRateSource : 'MANUAL',
  };
}

/** The sources the backend stores (FxRateSource). Anything else counts as MANUAL. */
const FX_RATE_SOURCES = ['FBIL', 'ECB', 'MANUAL'];

/**
 * Geographies on the wire: one item per whole state ({ stateId }), or one per
 * picked city ({ stateId, cityId }) for a state narrowed to cities. "All" or
 * nothing selected → [] (spendable anywhere). Cities of unselected states are ignored.
 */
function toGeographyItems(values) {
  const states = values.selectedGeographies || [];
  if (states.length === 0 || states.includes('ALL')) return [];
  const citiesByState = new Map();
  for (const v of values.selectedCities || []) {
    const [stateId, cityId] = String(v).split(':').map(Number);
    if (!Number.isFinite(stateId) || !Number.isFinite(cityId)) continue;
    citiesByState.set(stateId, [...(citiesByState.get(stateId) || []), cityId]);
  }
  return states.flatMap((s) => {
    const stateId = Number(s);
    const cities = citiesByState.get(stateId);
    return cities?.length ? cities.map((cityId) => ({ stateId, cityId })) : [{ stateId }];
  });
}

function isBlank(v) {
  return v === undefined || v === null || v === '';
}

/** FundProfileResponse → form default values for the edit screen. */
export function toFundProfileFormValues(dto) {
  const rule = (dto.disbursementRules || [])[0] || null;
  const trancheCriteria = rule?.trancheCriteria || [];
  const lumpSum = rule?.disbursementType === 'LUMP_SUM';

  return {
    fundMode: dto.fundMode || 'RESTRICTED',
    fundClass: dto.fundClass || '',
    purpose: dto.purpose || '',
    programmeTied: Boolean(dto.programmeTied),
    programmeId: dto.programmeId || '',
    reportingFrequency: dto.reportingFrequency || '',
    movementAllowed: Boolean(dto.movementAllowed),
    explanationRequired: Boolean(dto.explanationRequired),
    onboardingComplete: Boolean(dto.onboardingComplete),
    // One entry per state (a state listed by city has several rows), and its cities as "stateId:cityId".
    selectedGeographies: [...new Set((dto.geographies || []).map((g) => g.stateId))],
    selectedCities: (dto.geographies || []).filter((g) => g.cityId != null).map((g) => `${g.stateId}:${g.cityId}`),
    utilisationRules: (dto.utilisationRules || []).map((r) => ({
      ruleType: r.ruleType,
      otherRuleType: r.otherRuleType || '',
      limitPercentage: r.limitPercentage ?? '',
      description: r.description || '',
    })),
    disbursementType: rule?.disbursementType || 'LUMP_SUM',
    totalAmount: rule?.totalAmount ?? '',
    frequency: trancheCriteria[0]?.frequency || 'QUARTERLY',
    receivingDate: lumpSum ? (rule?.receivingDate || trancheCriteria[0]?.expectedReleaseDate || '') : '',
    lumpSumCriteria:
      lumpSum && (trancheCriteria[0]?.criteria || []).length
        ? trancheCriteria[0].criteria.map(toCriterionFormValue)
        : [emptyCriterion()],
    tranches: lumpSum ? [] : trancheCriteria.map(toTrancheFormValue),
    // Ids sent back on save so the rule and its tranches are updated, not replaced.
    disbursementRuleId: rule?.id ?? null,
    lumpSumTrancheId: lumpSum ? (trancheCriteria[0]?.id ?? null) : null,
    lumpSumTrancheCode: lumpSum ? (trancheCriteria[0]?.trancheCode || '') : '',
    // FC book: the saved currency / amount / rate, so editing doesn't re-derive them.
    ...(rule?.foreign
      ? {
          fcCurrency: rule.currency,
          fcAmount: rule.foreignAmount ?? '',
          fcRate: rule.fxRate ?? '',
          fcRateDate: rule.fxRateDate || '',
          fcRateSource: rule.fxRateSource || 'MANUAL',
        }
      : {}),
  };
}
