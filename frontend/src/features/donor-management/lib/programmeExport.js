/**
 * Programmes & projects → CSV, in the list's tree order: each programme, then
 * its projects (S.No 1, 1.1, 1.2, 2 …). `filters` are the list's own
 * (search, type, status); collapsing a programme on screen doesn't hide its
 * projects from the export.
 */
import { toCsv } from '../../../lib/export/csv.js';

const isProject = (p) => p.type === 'Project';

/** The programmes / projects the list shows for these filters, in tree order, with S.No. */
export function programmeRows(programmes, { search = '', type = 'all', status = 'all' } = {}) {
  const term = search.trim().toLowerCase();
  const matchesSearch = (p) =>
    !term || p.programmeName.toLowerCase().includes(term) || (p.programmeCode || '').toLowerCase().includes(term);
  const matchesStatus = (p) => status === 'all' || p.status === status;

  const children = new Map();
  const parents = [];
  programmes.forEach((p) => {
    if (isProject(p) && p.parentProgrammeId != null) {
      children.set(p.parentProgrammeId, [...(children.get(p.parentProgrammeId) || []), p]);
    } else {
      parents.push(p);
    }
  });

  const out = [];
  let n = 0;
  parents.forEach((parent) => {
    const all = children.get(parent.id) || [];
    const kids = type === 'programme' ? [] : all.filter((c) => matchesSearch(c) && matchesStatus(c));
    const parentMatches = type !== 'project' && matchesSearch(parent) && matchesStatus(parent);
    if (!parentMatches && !kids.length) return;
    const srNo = String(++n);
    // A project-only view still names its programme (as the list does), marked so it can be told apart.
    out.push({ ...parent, srNo, projectCount: all.length, listedOnlyAsParent: !parentMatches });
    kids.forEach((child, i) => out.push({ ...child, srNo: `${srNo}.${i + 1}`, parentCode: parent.programmeCode }));
  });
  return out;
}

export function programmesCsv(rows) {
  return toCsv(
    [
      { header: 's_no', value: (r) => r.srNo },
      { header: 'type', value: (r) => r.type || 'Programme' },
      { header: 'programme_code', value: (r) => r.programmeCode },
      { header: 'programme_name', value: (r) => r.programmeName },
      { header: 'parent_programme_code', value: (r) => (isProject(r) ? r.parentCode : '') },
      { header: 'parent_programme', value: (r) => (isProject(r) ? r.parentProgrammeName : '') },
      { header: 'projects', value: (r) => (isProject(r) ? '' : r.projectCount) },
      { header: 'status', value: (r) => r.status },
      { header: 'start_date', value: (r) => r.startDate || '' },
      { header: 'end_date', value: (r) => r.endDate || '' },
      { header: 'states', value: (r) => (r.stateNames || []).join('; ') },
      { header: 'cities', value: (r) => (r.cityNames || []).join('; ') },
      { header: 'description', value: (r) => r.description || '' },
    ],
    rows,
  );
}
