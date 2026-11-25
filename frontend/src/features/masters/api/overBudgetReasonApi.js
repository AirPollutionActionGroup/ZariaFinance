import { http } from '../../../lib/api/apiClient.js';

/**
 * Repository for /api/v1/over-budget-reasons (OverBudgetReasonController).
 * One function per backend endpoint — nothing more, nothing invented.
 */
export const overBudgetReasonApi = {
  /** GET /api/v1/over-budget-reasons[?search=&activeOnly=] → OverBudgetReasonResponse[]. */
  list: (search, activeOnly) => {
    const params = {};
    if (search) params.search = search;
    if (activeOnly) params.activeOnly = true;
    return http.get('/v1/over-budget-reasons', { params });
  },

  /** POST /api/v1/over-budget-reasons — body: { name, description?, status? } → 201. */
  create: (payload) => http.post('/v1/over-budget-reasons', payload),

  /** PUT /api/v1/over-budget-reasons/{id} — body: { name, description? }. */
  update: (id, payload) => http.put(`/v1/over-budget-reasons/${id}`, payload),

  /** PATCH /api/v1/over-budget-reasons/{id}/activate → 204. */
  activate: (id) => http.patch(`/v1/over-budget-reasons/${id}/activate`),

  /** PATCH /api/v1/over-budget-reasons/{id}/deactivate → 204. */
  deactivate: (id) => http.patch(`/v1/over-budget-reasons/${id}/deactivate`),
};
