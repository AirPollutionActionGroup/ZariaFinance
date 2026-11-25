import { Typography } from '@mui/material';
import { CsvImportPage } from '../../../shared/components/import/CsvImportPage.jsx';
import { useImportDebitNotes } from '../hooks/useDebitNotes.js';
import { IMPORT_COLUMNS, errorReportCsv, readImportFile, rowsToCsv, templateCsv } from '../lib/debitNoteImport.js';

const SPEC = {
  noun: 'debit note',
  nounPlural: 'debit notes',
  listPath: '/debit-notes',
  backLabel: 'Debit Notes',
  fileSlug: 'debit-notes',
  title: 'Import debit notes',
  subtitle:
    'Add many debit notes at once from a CSV file. Every row is checked first — budget and fund balances count the rows above it — and nothing is saved until you import.',
  templateDescription:
    'One row per debit note. Rows are matched by codes — outflow row id, employee ID or vendor code, donor and fund codes — and payment mode, group and ledger by name.',
  columns: IMPORT_COLUMNS,
  templateCsv,
  readImportFile,
  errorReportCsv,
  rowsToCsv,
  editorLayout: [
    { field: 'tallyVoucherNo', md: 3 },
    { field: 'tallyVoucherType', md: 3 },
    { field: 'date', md: 3 },
    { field: 'outflowLineId', md: 3 },
    { field: 'book', md: 2 },
    { field: 'amountInr', md: 2 },
    { field: 'reason', md: 4, xs: 12 },
    { field: 'payeeCategory', md: 2 },
    { field: 'payeeCode', md: 2 },
    { field: 'paidVia', md: 3 },
    { field: 'bankAccount', md: 3 },
    { field: 'paymentGroup', md: 3 },
    { field: 'ledger', md: 3 },
    { field: 'reference', md: 3 },
    { field: 'donorCode', md: 3 },
    { field: 'fundProfileCode', md: 3 },
    { field: 'remarks', md: 9, xs: 12 },
  ],
  partyHeader: 'Outflow line · payee · fund',
  renderParty: (r) => (
    <>
      <Typography variant="body2">{r.lineName || '—'}</Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontFamily: 'monospace' }}>
        {r.outflowLineId}
      </Typography>
      {r.payeeName ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {r.payeeCategory} · {r.payeeName}
        </Typography>
      ) : null}
      {r.fundProfileCode ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {r.donorName} · <span style={{ fontFamily: 'monospace' }}>{r.fundProfileCode}</span>
        </Typography>
      ) : null}
    </>
  ),
};

/** Import debit notes from a CSV file — /debit-notes/import. */
export function DebitNoteImportPage() {
  const importNotes = useImportDebitNotes();
  return <CsvImportPage spec={SPEC} importNotes={importNotes} />;
}
