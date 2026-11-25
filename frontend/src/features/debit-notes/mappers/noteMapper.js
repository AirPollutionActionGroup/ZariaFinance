/**
 * NoteMapper — NoteResponse (debit or credit) ⇄ the view model the note pages
 * use. The view model keeps the shape the pages were built on: `id` is the
 * note code (DN-2026-001), master picks are `{ id, name }` objects, and
 * `outflowLineId` is the outflow row id (BUD-2026-001-BL01-Q2).
 */

const num = (value) => (value == null || value === '' ? 0 : Number(value));

/** `{ id, name }` → the API's RefDto (string id); null when nothing was picked. */
function toRef(ref) {
  if (!ref || !ref.name) return null;
  return { id: ref.id == null || ref.id === '' ? null : String(ref.id), name: ref.name };
}

/** NoteResponse → view model. */
export function fromNoteResponse(dto) {
  return {
    id: dto.id,
    recordId: dto.recordId,
    outflowLineId: dto.outflowLineId || null,
    budgetCode: dto.budgetCode || null,
    lineCode: dto.lineCode || null,
    quarter: dto.quarter ?? null,
    lineDescription: dto.line || '',
    date: dto.date,
    amount: num(dto.amount),
    // Over-budget reason (Masters → Over-budget reasons): its name for display, its id for the form.
    reason: dto.overBudgetReason?.name || null,
    reasonId: dto.overBudgetReason?.id || null,
    book: dto.book,
    payeeCategory: dto.payeeCategory || null,
    payee: dto.payee || null,
    paymentMode: dto.paymentMode || null,
    bankAccount: dto.bankAccount || null,
    group: dto.group || null,
    ledger: dto.ledger || null,
    donor: dto.donor || null,
    fundProfile: dto.fundProfile || null,
    grant: dto.grant || null,
    disbursementType: dto.disbursementType || null,
    tranche: dto.tranche || null,
    reference: dto.reference || '',
    tallyVoucherType: dto.tallyVoucherType || null,
    tallyVoucherNo: dto.tallyVoucherNo || null,
    remarks: dto.remarks || '',
    // Only the file name is stored server-side (no file storage yet), so there's no download url.
    attachment: dto.attachmentName ? { name: dto.attachmentName } : null,
    currency: dto.currency || null,
    foreignAmount: dto.foreignAmount != null ? num(dto.foreignAmount) : null,
    fxRate: dto.fxRate != null ? num(dto.fxRate) : null,
    createdBy: dto.createdBy,
    createdAt: dto.createdAt,
  };
}

/** The create payload the note pages build → CreateDebitNoteRequest / CreateCreditNoteRequest. */
export function toCreateNoteRequest(input, { actor } = {}) {
  return {
    outflowLineId: input.outflowLineId || null,
    date: input.date,
    amount: num(input.amount),
    overBudgetReasonId: input.overBudgetReasonId ? Number(input.overBudgetReasonId) : null,
    book: input.book,
    payeeCategory: input.payeeCategory || null,
    payee: toRef(input.payee),
    paymentMode: toRef(input.paymentMode),
    bankAccount: toRef(input.bankAccount),
    group: toRef(input.group),
    ledger: toRef(input.ledger),
    donor: toRef(input.donor),
    fundProfile: toRef(input.fundProfile),
    grant: toRef(input.grant),
    disbursementType: input.disbursementType || null,
    tranche: toRef(input.tranche),
    reference: input.reference?.trim() || null,
    tallyVoucherType: input.tallyVoucherType?.trim() || null,
    tallyVoucherNo: input.tallyVoucherNo?.trim() || null,
    remarks: input.remarks?.trim() || null,
    attachmentName: input.attachment?.name || null,
    actor: actor || null,
    // FC receipt: the amount in the donor's currency and the rate it was converted at.
    ...(input.currency
      ? { currency: input.currency, foreignAmount: num(input.foreignAmount), fxRate: num(input.fxRate) }
      : {}),
  };
}
