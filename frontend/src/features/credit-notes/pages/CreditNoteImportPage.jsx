import { Typography } from '@mui/material';
import { CsvImportPage } from '../../../shared/components/import/CsvImportPage.jsx';
import { formatForeign } from '../../donor-management/lib/foreignContribution.js';
import { useImportCreditNotes } from '../hooks/useCreditNotes.js';
import { IMPORT_COLUMNS, errorReportCsv, readImportFile, rowsToCsv, templateCsv } from '../lib/creditNoteImport.js';

const isFc = (draft) => String(draft.book || '').toUpperCase() === 'FC';

const SPEC = {
  noun: 'credit note',
  nounPlural: 'credit notes',
  listPath: '/credit-notes',
  backLabel: 'Credit Notes',
  fileSlug: 'credit-notes',
  title: 'Import credit notes',
  subtitle: 'Add many credit notes at once from a CSV file. Every row is checked first — nothing is saved until you import.',
  templateDescription: 'One row per credit note. Rows are matched by codes — donor, fund profile and tranche codes — not by names.',
  columns: IMPORT_COLUMNS,
  templateCsv,
  readImportFile,
  errorReportCsv,
  rowsToCsv,
  editorLayout: [
    { field: 'tallyVoucherNo', md: 3 },
    { field: 'tallyVoucherType', md: 3 },
    { field: 'date', md: 3 },
    { field: 'book', md: 3 },
    { field: 'amountInr', md: 3 },
    { field: 'receivedVia', md: 3 },
    { field: 'bankAccount', md: 3 },
    { field: 'reference', md: 3 },
    { field: 'donorCode', md: 4, xs: 12 },
    { field: 'fundProfileCode', md: 4 },
    { field: 'trancheCode', md: 4 },
    { field: 'currency', md: 2, xs: 4, when: isFc },
    { field: 'foreignAmount', md: 2, xs: 4, when: isFc },
    { field: 'fxRate', md: 2, xs: 4, when: isFc },
    { field: 'remarks', md: (d) => (isFc(d) ? 6 : 12), xs: 12 },
  ],
  partyHeader: 'Donor · fund · tranche',
  renderParty: (r) => (
    <>
      <Typography variant="body2">{r.donorName || '—'}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
        {[r.fundProfileCode, r.trancheCode].filter(Boolean).join(' · ')}
      </Typography>
    </>
  ),
  renderAmountExtra: (r) =>
    r.currency && r.foreignAmount != null ? (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontVariantNumeric: 'tabular-nums' }}>
        {formatForeign(r.currency, r.foreignAmount)}
      </Typography>
    ) : null,
};

/** Import credit notes from a CSV file — /credit-notes/import. */
export function CreditNoteImportPage() {
  const importNotes = useImportCreditNotes();
  return <CsvImportPage spec={SPEC} importNotes={importNotes} />;
}
