import { overBudgetReasonApi } from '../api/overBudgetReasonApi.js';
import { MASTER_STATUS_LABEL } from '../constants.js';

/** OverBudgetReasonResponse → view model. */
const fromResponse = (dto) => ({
  ...dto,
  description: dto.description || '',
  usedCount: Number(dto.usedCount) || 0,
  statusLabel: MASTER_STATUS_LABEL[dto.status] || dto.status || '—',
});

/**
 * Over-budget reason master — why a debit note took its budget line over
 * budget (Additional charge, FX difference, …). Debit notes point at one by id.
 */
export const overBudgetReasonService = {
  async listReasons(search) {
    return (await overBudgetReasonApi.list(search)).map(fromResponse);
  },

  /** Active reasons only — for the debit note form. */
  async listActiveReasons() {
    return (await overBudgetReasonApi.list('', true)).map(fromResponse);
  },

  async createReason(values) {
    return fromResponse(
      await overBudgetReasonApi.create({
        name: values.name.trim(),
        description: values.description?.trim() || null,
        status: values.status !== 'INACTIVE',
      }),
    );
  },

  async updateReason(id, values) {
    return fromResponse(
      await overBudgetReasonApi.update(id, {
        name: values.name.trim(),
        description: values.description?.trim() || null,
      }),
    );
  },

  async activateReason(id) {
    await overBudgetReasonApi.activate(id);
  },

  async deactivateReason(id) {
    await overBudgetReasonApi.deactivate(id);
  },
};
