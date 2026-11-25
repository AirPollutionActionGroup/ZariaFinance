/**
 * The lifecycle action copy for the funding detail page. Moved here from the old Grant Agreement detail page
 * (/grants/:id), which was removed — /funding/:id shows the agreement now.
 */
export const ACTION_COPY = {
  approve: {
    label: 'Approve',
    title: 'Approve grant',
    description: 'Approve this grant agreement? Approval is recorded in the change history.',
    color: 'success',
  },
  activate: {
    label: 'Activate',
    title: 'Activate grant',
    description: 'Activate this grant? Committed funds become part of the live position.',
    color: 'primary',
  },
  close: {
    label: 'Close',
    title: 'Close grant',
    description: 'Close this grant agreement? No further transactions can reference it.',
    color: 'error',
  },
  hold: {
    label: 'Put on hold',
    title: 'Put grant on hold',
    description: 'Put this grant agreement on hold? It stays active but is flagged for review.',
    color: 'warning',
  },
  resume: {
    label: 'Resume',
    title: 'Resume grant',
    description: 'Resume this grant agreement from hold and return it to approved status?',
    color: 'primary',
  },
  complete: {
    label: 'Mark completed',
    title: 'Mark grant completed',
    description: 'Mark this grant agreement as completed? This reflects the grant has run its course.',
    color: 'primary',
  },
};
