/**
 * Funding ↔ wire. The form keeps one flat set of fund profile fields plus an
 * `agreement` object; the API takes { donorId, terms, agreement } and answers
 * with { id, stage, terms, agreement }.
 */
import { fromFundProfileResponse, toFundProfileRequest } from '../../donor-management/mappers/fundProfileMapper.js';
import { fromGrantDetailsResponse } from '../../donor-management/mappers/grantMapper.js';
import { FUND_CLASS_SHORT } from '../../donor-management/constants.js';

/** Server stage (FundingStage) → the stage keys the pages use. */
export const STAGE_KEY = Object.freeze({
  TERMS: 'terms',
  PENDING: 'pending',
  APPROVED: 'approved',
  ON_HOLD: 'onhold',
  COMPLETED: 'completed',
});

const blankToNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

/** Form values → FundingRequest. No agreement is sent when "add later" is chosen. */
export function toFundingRequest(values, { actor, changeNote } = {}) {
  const agreement = values.agreement || {};
  return {
    donorId: Number(values.donorId),
    terms: toFundProfileRequest(values),
    agreement: values.withAgreement
      ? {
          agreementDate: blankToNull(agreement.agreementDate),
          startDate: blankToNull(agreement.startDate),
          endDate: blankToNull(agreement.endDate),
          description: blankToNull(agreement.description),
          agreementDocumentPath: blankToNull(agreement.agreementDocumentPath),
        }
      : null,
    // Who is saving and why — written to the record's change history.
    actor: blankToNull(actor),
    changeNote: blankToNull(changeNote),
  };
}

/** FundingResponse → { id, stage, profile, grant } (grant null until an agreement exists). */
export function fromFundingResponse(dto) {
  return {
    id: dto.id,
    stage: STAGE_KEY[dto.stage] || 'pending',
    profile: fromFundProfileResponse(dto.terms),
    grant: dto.agreement ? fromGrantDetailsResponse(dto.agreement) : null,
  };
}

/** FundingListItem → a list row. An agreement with no fund profile (none exist today) has no record page. */
export function fromFundingListItem(item) {
  return {
    key: item.profileId != null ? `fp-${item.profileId}` : `ga-${item.grantId}`,
    profileId: item.profileId ?? null,
    grantId: item.grantId ?? null,
    profileCode: item.profileCode || null,
    grantCode: item.grantCode || null,
    legacyCode: item.legacyCode || null,
    donorId: item.donorId ?? null,
    donorName: item.donorName || '—',
    title: item.title || null,
    // The agreement's own status (ACTIVE / COMPLETED / CANCELLED) and active flag; null for terms only.
    agreementStatus: item.agreementStatus || null,
    active: item.active ?? null,
    programmeName: item.programmeName || null,
    classCode: classLetter(item.fundClass),
    committed: Number(item.committed) || 0,
    currency: item.currency || null,
    foreignAmount: item.foreignAmount != null ? Number(item.foreignAmount) : null,
    hasSchedule: Boolean(item.hasSchedule),
    startDate: item.startDate || null,
    endDate: item.endDate || null,
    stage: STAGE_KEY[item.stage] || 'pending',
    stageLabel: item.stageLabel || null,
    href: item.profileId != null ? `/funding/${item.profileId}` : null,
  };
}

/** "A" | "B" | "C" | null — the server sends the full enum, older grants just the letter. */
function classLetter(raw) {
  if (!raw) return null;
  return FUND_CLASS_SHORT[raw] || (['A', 'B', 'C'].includes(raw) ? raw : null);
}

/** disbursementRules.0.<field> → the flat form field it belongs to. */
const RULE_FIELD = {
  totalAmount: 'totalAmount',
  disbursementType: 'disbursementType',
  receivingDate: 'receivingDate',
  currency: 'fcCurrency',
  foreignAmount: 'fcAmount',
  fxRate: 'fcRate',
  fxRateDate: 'fcRateDate',
  fxRateSource: 'fcRate',
};

/** trancheCriteria.N.<field> → the tranche row field. */
const TRANCHE_FIELD = {
  amountCriteria: 'amount',
  foreignAmount: 'fcAmount',
  expectedReleaseDate: 'expectedReleaseDate',
};

/**
 * Server field errors (keyed by request path) → form field names.
 *   terms.purpose                                → purpose
 *   terms.geographies                            → selectedGeographies
 *   terms.disbursementRules.0.currency           → fcCurrency
 *   terms.disbursementRules.0.trancheCriteria    → tranches / lumpSumCriteria
 *   terms.disbursementRules.0.trancheCriteria.1.foreignAmount → tranches.1.fcAmount
 *   agreement.endDate                            → agreement.endDate
 * Returns { fieldErrors, otherMessages } — messages with no field on the form
 * are shown in the error summary instead of being lost.
 */
export function toFormErrors(serverErrors, values) {
  const fieldErrors = {};
  const otherMessages = [];
  const lumpSum = values?.disbursementType === 'LUMP_SUM';

  for (const [path, message] of Object.entries(serverErrors || {})) {
    const field = formFieldFor(path, lumpSum);
    if (field) fieldErrors[field] = message;
    else otherMessages.push(message);
  }
  return { fieldErrors, otherMessages };
}

function formFieldFor(path, lumpSum) {
  if (path === 'donorId' || path.startsWith('agreement.')) return path;
  if (!path.startsWith('terms.')) return null;

  const rest = path.slice('terms.'.length);
  if (rest === 'geographies' || rest.startsWith('geographies.')) return 'selectedGeographies';

  const rule = /^disbursementRules(?:\.\d+)?(?:\.(.+))?$/.exec(rest);
  if (!rule) return rest.includes('.') ? null : rest; // top-level term fields share their names
  const inRule = rule[1];
  if (!inRule) return 'totalAmount';
  if (RULE_FIELD[inRule]) return RULE_FIELD[inRule];

  const tranche = /^trancheCriteria(?:\.(\d+)(?:\.(.+))?)?$/.exec(inRule);
  if (!tranche) return null;
  const [, index, field] = tranche;
  if (index === undefined) return lumpSum ? 'lumpSumCriteria' : 'tranches';
  if (lumpSum) {
    // A lump sum is one tranche on the wire; its criteria are lumpSumCriteria[].
    const criterion = /^criteria(?:\.(\d+)\.(.+))?$/.exec(field || '');
    if (criterion) return criterion[1] !== undefined ? `lumpSumCriteria.${criterion[1]}.${criterion[2]}` : 'lumpSumCriteria';
    return field === 'expectedReleaseDate' ? 'receivingDate' : 'totalAmount';
  }
  if (!field) return `tranches.${index}`;
  if (TRANCHE_FIELD[field]) return `tranches.${index}.${TRANCHE_FIELD[field]}`;
  return `tranches.${index}.${field}`;
}
