import { describe, expect, it } from 'vitest';
import { duplicateEmails, primaryIndex, toContactItems, toContactRows } from './donorContacts.js';
import { donorFormDefaults, donorSchema } from '../validation/donorSchema.js';

describe('donor contacts', () => {
  it('rows from the API keep the primary; none marked → the first is primary', () => {
    const rows = toContactRows([
      { id: 1, name: 'A', email: 'a@x.org', phone: null, isPrimary: false },
      { id: 2, name: 'B', email: 'b@x.org', phone: '99', isPrimary: true },
    ]);
    expect(rows.map((r) => r.isPrimary)).toEqual([false, true]);
    expect(rows[0].phone).toBe('');
    expect(toContactRows([{ id: 1, name: 'A', email: 'a@x.org' }])[0].isPrimary).toBe(true);
    expect(toContactRows([])).toHaveLength(1);
  });

  it('request items: trimmed, blank phone → null, exactly one primary', () => {
    const items = toContactItems([
      { id: null, name: ' A ', email: ' a@x.org ', phone: ' ', isPrimary: false },
      { id: 4, name: 'B', email: 'b@x.org', phone: '98', isPrimary: false },
    ]);
    expect(items).toEqual([
      { id: null, name: 'A', email: 'a@x.org', phone: null, isPrimary: true },
      { id: 4, name: 'B', email: 'b@x.org', phone: '98', isPrimary: false },
    ]);
    expect(primaryIndex([{ isPrimary: false }, { isPrimary: true }])).toBe(1);
  });

  it('finds repeated emails in any case', () => {
    const dups = duplicateEmails([{ email: 'a@x.org' }, { email: 'b@x.org' }, { email: 'A@X.org ' }]);
    expect([...dups]).toEqual([[2, 0]]);
  });

  it('the form schema needs name + valid email on every contact, and no repeated email', () => {
    const base = { ...donorFormDefaults, donorCode: 'DNR-1', donorName: 'D', donorType: 1, fundSourceDomicile: 'FOREIGN', email: 'd@x.org', address: 'Street' };
    const issues = (contacts) =>
      (donorSchema.safeParse({ ...base, contacts }).error?.issues || [])
        .filter((i) => i.path[0] === 'contacts')
        .map((i) => `${i.path.join('.')}: ${i.message}`);
    expect(issues([{ id: null, name: 'A', email: 'a@x.org', phone: '', isPrimary: true }])).toEqual([]);
    expect(issues([])).toEqual(['contacts: Add at least one point of contact']);
    expect(issues([
      { id: null, name: '', email: 'nope', phone: '', isPrimary: true },
      { id: null, name: 'B', email: 'b@x.org', phone: '', isPrimary: false },
      { id: null, name: 'C', email: 'B@x.org', phone: '', isPrimary: false },
    ])).toEqual(['contacts.0.name: Name is required', 'contacts.0.email: Email must be valid', 'contacts.2.email: This email is already on contact 2']);
  });
});
