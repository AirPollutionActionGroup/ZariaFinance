/**
 * A donor's points of contact on the form: one or more rows of
 * { id, name, email, phone, isPrimary }, exactly one primary.
 * Pure helpers, shared by the form, the mapper and their tests.
 */

export const MAX_CONTACTS = 10;

/** A blank contact row (primary when it's the first one). */
export const emptyContact = (isPrimary = false) => ({ id: null, name: '', email: '', phone: '', isPrimary });

/** Index of the primary row (the first row if none is marked). */
export function primaryIndex(contacts) {
  const i = (contacts || []).findIndex((c) => c.isPrimary);
  return i >= 0 ? i : 0;
}

/** DonorResponse.contacts → form rows; a donor without any gets one blank primary row. */
export function toContactRows(contacts) {
  const rows = (contacts || []).map((c) => ({
    id: c.id ?? null,
    name: c.name || '',
    email: c.email || '',
    phone: c.phone || '',
    isPrimary: Boolean(c.isPrimary),
  }));
  if (!rows.length) return [emptyContact(true)];
  const p = primaryIndex(rows);
  return rows.map((r, i) => ({ ...r, isPrimary: i === p }));
}

/** Form rows → DonorContactItem[] for the create / update request (exactly one primary). */
export function toContactItems(rows) {
  const p = primaryIndex(rows);
  return (rows || []).map((c, i) => {
    const phone = String(c.phone ?? '').trim();
    return {
      id: c.id ?? null,
      name: String(c.name ?? '').trim(),
      email: String(c.email ?? '').trim(),
      phone: phone === '' ? null : phone,
      isPrimary: i === p,
    };
  });
}

/** Indexes of rows whose email (any case) is already on an earlier row → that earlier row's index. */
export function duplicateEmails(rows) {
  const seen = new Map();
  const dups = new Map();
  (rows || []).forEach((c, i) => {
    const email = String(c.email ?? '').trim().toLowerCase();
    if (!email) return;
    if (seen.has(email)) dups.set(i, seen.get(email));
    else seen.set(email, i);
  });
  return dups;
}
