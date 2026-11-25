import { http } from '../../../lib/api/apiClient.js';

/**
 * Repository for /api/v1/credit-notes (CreditNoteController). Notes are
 * addressed by code, e.g. CN-2026-001.
 */
export const creditNoteApi = {
  /** GET /api/v1/credit-notes → NoteResponse[] (newest first). */
  list: () => http.get('/v1/credit-notes'),

  /** GET /api/v1/credit-notes/{code} → NoteResponse. */
  getByCode: (code) => http.get(`/v1/credit-notes/${encodeURIComponent(code)}`),

  /** POST /api/v1/credit-notes — body: CreateCreditNoteRequest → NoteResponse (201). */
  create: (payload) => http.post('/v1/credit-notes', payload),

  /**
   * POST /api/v1/credit-notes/import — CSV rows → a result per row. With
   * dryRun: true nothing is saved; otherwise the selected valid rows are.
   */
  importRows: (payload) => http.post('/v1/credit-notes/import', payload),
};
