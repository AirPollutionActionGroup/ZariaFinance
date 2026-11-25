import { http } from '../../../lib/api/apiClient.js';

/**
 * Repository for the Funding endpoints (FundingController). A funding record is
 * a fund profile (terms) plus the grant agreement signed on it; its id is the
 * fund profile's id. The agreement's status steps are PATCH /v1/funding/{id}/<step>.
 */
export const fundingApi = {
  /** GET /api/v1/funding?donorId=&stage= → FundingListItem[]. */
  list: (params = {}) => http.get('/v1/funding', { params }),

  /** GET /api/v1/funding/{id} → FundingResponse { id, stage, terms, agreement }. */
  getById: (id) => http.get(`/v1/funding/${id}`),

  /** POST /api/v1/funding — FundingRequest → FundingResponse (201). One transaction. */
  create: (payload) => http.post('/v1/funding', payload),

  /** PUT /api/v1/funding/{id} — FundingRequest → FundingResponse. One transaction. */
  update: (id, payload) => http.put(`/v1/funding/${id}`, payload),
  /** GET /api/v1/funding/{id}/history → FundingHistoryEntry[] (newest first). */
  history: (id) => http.get(`/v1/funding/${id}/history`),

  /**
   * PATCH /api/v1/funding/{id}/{step} → 204 — the agreement's status steps:
   * approve, activate, hold, resume, complete, close. `payload` carries
   * remarks (approve, hold); `actor` is who did it (for the change history).
   */
  statusStep: (id, step, payload, actor) => http.patch(`/v1/funding/${id}/${step}`, payload, { params: { actor } }),
};
