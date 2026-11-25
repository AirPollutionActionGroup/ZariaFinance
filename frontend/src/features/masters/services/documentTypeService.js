import { documentTypeApi } from '../api/documentTypeApi.js';
import { MASTER_STATUS_LABEL } from '../constants.js';

/** DocumentTypeResponse → view model. */
const fromResponse = (dto) => ({
  ...dto,
  statusLabel: MASTER_STATUS_LABEL[dto.status] || dto.status || '—',
  allowedFundSourceDomiciles: dto.allowedFundSourceDomiciles || [],
  requiredForDonorTypeIds: dto.requiredForDonorTypeIds || [],
});

/**
 * Whether a document type is offered to a donor with this fund source domicile
 * (DOMESTIC | FOREIGN). With no domicile chosen yet, every type is offered.
 */
export function documentTypeAppliesTo(type, domicile) {
  const allowed = type.allowedFundSourceDomiciles || [];
  return !domicile || allowed.length === 0 || allowed.includes(domicile);
}

/**
 * The document types a donor of this donor type must give (one of them), among
 * those offered to its fund source domicile. Empty = no requirement.
 */
export function requiredDocumentTypes(types, donorTypeId, domicile) {
  if (donorTypeId == null || donorTypeId === '') return [];
  return types.filter(
    (t) => (t.requiredForDonorTypeIds || []).some((id) => String(id) === String(donorTypeId)) && documentTypeAppliesTo(t, domicile),
  );
}

/**
 * Document Type master — the identity documents a donor can be identified by
 * (PAN Card, Aadhaar Card, …). Donors point at a type by its id.
 */
export const documentTypeService = {
  async listDocumentTypes(search) {
    return (await documentTypeApi.list(search)).map(fromResponse);
  },

  /** Active types only — for the donor form's dropdown. */
  async listActiveDocumentTypes() {
    return (await documentTypeApi.list('', true)).map(fromResponse);
  },

  async createDocumentType(values) {
    return fromResponse(
      await documentTypeApi.create({
        name: values.name.trim(),
        status: values.status !== 'INACTIVE',
        allowedFundSourceDomiciles: values.allowedFundSourceDomiciles || [],
        requiredForDonorTypeIds: (values.requiredForDonorTypeIds || []).map(Number),
      }),
    );
  },

  async updateDocumentType(id, values) {
    return fromResponse(
      await documentTypeApi.update(id, {
        name: values.name.trim(),
        allowedFundSourceDomiciles: values.allowedFundSourceDomiciles || [],
        requiredForDonorTypeIds: (values.requiredForDonorTypeIds || []).map(Number),
      }),
    );
  },

  async activateDocumentType(id) {
    await documentTypeApi.activate(id);
  },

  async deactivateDocumentType(id) {
    await documentTypeApi.deactivate(id);
  },
};
