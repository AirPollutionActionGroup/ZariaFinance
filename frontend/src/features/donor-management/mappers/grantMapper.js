/**
 * GrantMapper — GrantListResponse / GrantDetailsResponse ↔ view models,
 * form values → CreateGrantRequest. Field names mirror the backend DTOs.
 *
 * A grant's class is the profile's restriction class (A/B/C, `fundClassCode`),
 * not the donor typology enum.
 */

/** Agreement status (section 1 of the form) → display label. */
export const GRANT_STATUS_LABEL = {
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Approval workflow state (isApproved) → display label. */
export const APPROVAL_STATUS_LABEL = {
  1: 'Approved',
  2: 'Pending',
  3: 'On hold',
  4: 'Completed',
};

export function fromGrantListResponse(dto) {
  return {
    ...dto,
    fundClassLabel: dto.fundClassCode ? `Class ${dto.fundClassCode}` : '—',
    statusLabel: GRANT_STATUS_LABEL[dto.status] || (dto.isActive ? 'Active' : 'Inactive'),
    approvalStatusLabel: APPROVAL_STATUS_LABEL[dto.isApproved] || '—',
  };
}

export function fromGrantDetailsResponse(dto) {
  return fromGrantListResponse(dto);
}

/** GrantDetailsResponse → edit-form values (strings, mirroring grantFormDefaults). */
export function toGrantFormValues(grant) {
  return {
    grantCode: grant.grantCode || '',
    donorId: grant.donorId != null ? String(grant.donorId) : '',
    fundProfileId: grant.fundProfileId != null ? String(grant.fundProfileId) : '',
    agreementName: grant.agreementName || '',
    status: grant.status || 'ACTIVE',
    agreementDate: grant.agreementDate || '',
    startDate: grant.startDate || '',
    endDate: grant.endDate || '',
    approvalStatus: grant.isApproved != null ? String(grant.isApproved) : '2',
    approvedBy: grant.approvedBy != null ? String(grant.approvedBy) : '',
    // approvalDate is a timestamp on the wire; the form field is a date.
    approvalDate: grant.approvalDate ? String(grant.approvalDate).slice(0, 10) : '',
    approvalRemarks: grant.approvalRemarks || '',
    description: grant.description || '',
    agreementDocumentPath: grant.agreementDocumentPath || '',
  };
}
