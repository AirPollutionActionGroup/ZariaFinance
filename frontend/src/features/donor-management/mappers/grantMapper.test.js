import { describe, expect, it } from 'vitest';
import { fromGrantDetailsResponse, toGrantFormValues } from './grantMapper.js';

/** The agreement inside a funding record (FundingResponse.agreement) → view model / edit-form values. */
describe('grantMapper', () => {
  it('adds the status, approval and class labels', () => {
    const grant = fromGrantDetailsResponse({ id: 7, grantCode: 'GR-7', fundClassCode: 'A', status: 'ACTIVE', isActive: true, isApproved: 2 });
    expect(grant.statusLabel).toBe('Active');
    expect(grant.approvalStatusLabel).toBe('Pending');
    expect(grant.fundClassLabel).toBe('Class A');
  });

  it('labels completed and cancelled agreements from status, not the isActive flag', () => {
    const labels = [
      { id: 1, status: 'COMPLETED', isActive: false },
      { id: 2, status: 'CANCELLED', isActive: false },
    ].map((dto) => fromGrantDetailsResponse(dto).statusLabel);
    expect(labels).toEqual(['Completed', 'Cancelled']);
  });

  it('round-trips description and document path so an edit cannot wipe them', () => {
    const values = toGrantFormValues({
      id: 4,
      status: 'COMPLETED',
      isApproved: 3,
      approvedBy: 6,
      approvalDate: '2026-03-04T10:15:00',
      description: 'existing note',
      agreementDocumentPath: '/docs/agreement.pdf',
    });
    expect(values.status).toBe('COMPLETED');
    expect(values.approvalStatus).toBe('3');
    expect(values.approvedBy).toBe('6');
    // The column is a timestamp; the form field is a date.
    expect(values.approvalDate).toBe('2026-03-04');
    expect(values.description).toBe('existing note');
    expect(values.agreementDocumentPath).toBe('/docs/agreement.pdf');
  });
});
