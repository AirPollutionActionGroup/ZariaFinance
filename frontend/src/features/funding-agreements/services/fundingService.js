import { fundingApi } from '../api/fundingApi.js';
import { fromFundingListItem, fromFundingResponse, toFundingRequest } from '../mappers/fundingMapper.js';

/**
 * Funding domain service: terms + agreement as one record. Saving is a single
 * call, so the server saves both or neither.
 */
export const fundingService = {
  async list(filters = {}) {
    const items = await fundingApi.list(filters);
    return items.map(fromFundingListItem);
  },

  async get(id) {
    return fromFundingResponse(await fundingApi.getById(id));
  },

  /** `meta` = { actor, changeNote } — who is saving and why, for the change history. */
  async create(formValues, meta) {
    return fromFundingResponse(await fundingApi.create(toFundingRequest(formValues, meta)));
  },
  async update(id, formValues, meta) {
    return fromFundingResponse(await fundingApi.update(id, toFundingRequest(formValues, meta)));
  },
  /**
   * One of the agreement's status steps (approve / activate / hold / resume /
   * complete / close) on funding record `id`. Only approve and hold take remarks.
   */
  async statusStep(id, step, { remarks, approvedBy } = {}, actor) {
    const payload = step === 'approve' ? { approvedBy, remarks } : step === 'hold' ? { remarks } : undefined;
    await fundingApi.statusStep(id, step, payload, actor);
  },
  /** The record's change history, newest first. */
  async history(id) {
    return (await fundingApi.history(id)).map((e) => ({ ...e, changes: e.changes || [] }));
  },
};
