const DAY = 24 * 60 * 60 * 1000;

/** Whole days from today to an ISO date (negative = in the past). */
export function daysFromToday(isoDate) {
  if (!isoDate) return null;
  return Math.ceil((new Date(`${isoDate}T00:00:00`).getTime() - Date.now()) / DAY);
}

/**
 * Where a tranche stands: received in full, partly, overdue, due within 30
 * days, or later. Before the agreement exists nothing is expected yet.
 * Returns { key, label, tone } — tone is a StatusChip tone.
 */
export function trancheStatus({ expected, received = 0, expectedDate, hasAgreement = true }) {
  if (!hasAgreement) return { key: 'waiting', label: 'Awaiting agreement', tone: 'neutral' };
  if (expected > 0 && received >= expected) return { key: 'received', label: 'Received', tone: 'success' };
  if (received > 0) return { key: 'partial', label: 'Part received', tone: 'warning' };
  const days = daysFromToday(expectedDate);
  if (days == null) return { key: 'nodate', label: 'No date', tone: 'neutral' };
  if (days < 0) return { key: 'overdue', label: `Overdue ${-days}d`, tone: 'error' };
  if (days <= 30) return { key: 'due', label: days === 0 ? 'Due today' : `Due in ${days}d`, tone: 'info' };
  return { key: 'upcoming', label: 'Upcoming', tone: 'neutral' };
}

/** "in 12 days" / "today" / "5 days ago" for an ISO date. */
export function relativeDay(isoDate) {
  const days = daysFromToday(isoDate);
  if (days == null) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
