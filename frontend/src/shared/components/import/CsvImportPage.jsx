import { Fragment, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Collapse,
  Grid,
  IconButton,
  Link,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../core/auth/index.js';
import { PageHeader } from '../PageHeader.jsx';
import { downloadCsv } from '../../../lib/export/csv.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { formatDate } from '../../../lib/format/date.js';
import { MAX_IMPORT_BYTES, MAX_IMPORT_ROWS, defaultSelection } from '../../../lib/import/csvImport.js';

const MONEY_SX = { fontVariantNumeric: 'tabular-nums' };
const STATUS = {
  READY: { label: 'Ready', color: 'success' },
  WARNING: { label: 'Check', color: 'warning' },
  ERROR: { label: 'Error', color: 'error' },
  IMPORTED: { label: 'Imported', color: 'success' },
  SKIPPED: { label: 'Skipped', color: 'default' },
};
const STEPS = ['Start from the template', 'Upload & check', 'Import'];
const today = () => new Date().toLocaleDateString('en-CA');
const resolve = (v, draft) => (typeof v === 'function' ? v(draft) : v);

/**
 * @typedef {Object} ImportSpec  What differs between the note imports.
 * @property {string} noun / nounPlural   'credit note' / 'credit notes'
 * @property {string} listPath            '/credit-notes' — notes open at `${listPath}/${code}`
 * @property {string} backLabel, title, subtitle, templateDescription, fileSlug
 * @property {Array}  columns             template columns { header, field, required?, hint, options? }
 * @property {Function} templateCsv, readImportFile(text), errorReportCsv(results, rows), rowsToCsv(rows)
 * @property {Array}  editorLayout        [{ field, md, xs?, when?(draft) }] — md may be a function of the draft
 * @property {string} partyHeader         heading of the "what it resolved to" column
 * @property {Function} renderParty(row)  that column's cell content
 * @property {Function} [renderAmountExtra(row)] a second line under the amount
 * @property {{header: string, render: Function}} [firstColumn] replaces the "Date · book" column
 * @property {Function} [createdLink(row)] → { label, path } of what an imported row created (default: the note code)
 */

/** Default: the note code, opening `${listPath}/${code}`. */
const noteLink = (spec) => (r) => (r.noteCode ? { label: r.noteCode, path: `${spec.listPath}/${r.noteCode}` } : null);

/** Card with a numbered heading, for the two parts of the upload step. */
function StepCard({ number, title, description, children }) {
  return (
    <Card variant="outlined" sx={{ borderRadius: 3, p: { xs: 2.25, sm: 2.75 }, height: '100%' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'baseline', mb: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'success.main', letterSpacing: '0.06em' }}>
          0{number}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {description}
      </Typography>
      {children}
    </Card>
  );
}

/** The template's columns as a small form, to fix one row on the page. Values stay text, as in the file. */
function RowEditor({ spec, row, saving, onSave, onCancel }) {
  const [draft, setDraft] = useState(row);
  const set = (field) => (e) => setDraft((d) => ({ ...d, [field]: e.target.value === '' ? null : e.target.value }));
  const byField = Object.fromEntries(spec.columns.map((c) => [c.field, c]));
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
      sx={{ p: 2, bgcolor: 'var(--card2)', borderTop: '1px dashed', borderColor: 'divider' }}
    >
      <Typography variant="body2" sx={{ fontWeight: 700, mb: 1.5 }}>
        Edit row {row.rowNumber}
      </Typography>
      <Grid container spacing={1.5}>
        {spec.editorLayout
          .filter((item) => !item.when || item.when(draft))
          .map((item) => {
            const c = byField[item.field];
            const options = c.options;
            return (
              <Grid key={c.field} size={{ xs: item.xs ?? 6, md: resolve(item.md, draft) }}>
                <TextField
                  fullWidth
                  size="small"
                  label={c.header}
                  required={c.required}
                  value={options ? String(draft[c.field] ?? '').toUpperCase() : draft[c.field] ?? ''}
                  onChange={set(c.field)}
                  helperText={c.hint || ' '}
                  select={Boolean(options)}
                  slotProps={{ inputLabel: { shrink: true }, formHelperText: { sx: { mx: 0.5 } } }}
                >
                  {options
                    ? [
                        ...(c.required ? [] : [<MenuItem key="" value="">—</MenuItem>]),
                        ...options.map((o) => (
                          <MenuItem key={o} value={o.toUpperCase()}>
                            {o}
                          </MenuItem>
                        )),
                      ]
                    : null}
                </TextField>
              </Grid>
            );
          })}
      </Grid>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 0.5 }}>
        <Button color="inherit" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" color="success" disabled={saving}>
          {saving ? 'Checking…' : 'Save & recheck'}
        </Button>
      </Stack>
    </Box>
  );
}

/** Each row's status, what it resolved to, and why — the preview and the result share it. */
function RowsTable({ spec, rows, selectable, selected, onToggle, onOpenNote, editing, edited, sourceByRow, saving, onEdit, onSaveRow }) {
  const columns = (selectable ? 8 : 6) - (spec.hideAmount ? 1 : 0);
  const linkOf = spec.createdLink || noteLink(spec);
  return (
    <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow sx={{ '& th': { color: 'text.secondary', fontWeight: 600, whiteSpace: 'nowrap', bgcolor: 'var(--card2)' } }}>
            {selectable ? <TableCell padding="checkbox" /> : null}
            <TableCell>Row</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>{spec.firstColumn?.header || 'Date · book'}</TableCell>
            <TableCell>{spec.partyHeader}</TableCell>
            {spec.hideAmount ? null : <TableCell align="right">Amount</TableCell>}
            <TableCell>{selectable ? 'Notes' : `${spec.noun[0].toUpperCase()}${spec.noun.slice(1)} / reason`}</TableCell>
            {selectable ? <TableCell /> : null}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const s = STATUS[r.status] || STATUS.READY;
            const isEditing = editing === r.rowNumber;
            return (
              <Fragment key={r.rowNumber}>
                <TableRow hover selected={isEditing} sx={{ verticalAlign: 'top' }}>
                  {selectable ? (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selected.has(r.rowNumber)}
                        disabled={r.status === 'ERROR'}
                        onChange={() => onToggle(r.rowNumber)}
                        inputProps={{ 'aria-label': `Import row ${r.rowNumber}` }}
                      />
                    </TableCell>
                  ) : null}
                  <TableCell sx={{ color: 'text.secondary' }}>{r.rowNumber}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={s.color}
                      variant={r.status === 'IMPORTED' ? 'filled' : 'outlined'}
                      label={r.duplicate && r.status !== 'IMPORTED' && r.status !== 'SKIPPED' ? 'Duplicate?' : s.label}
                    />
                    {edited?.has(r.rowNumber) ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                        Edited
                      </Typography>
                    ) : null}
                  </TableCell>
                  {spec.firstColumn ? (
                    <TableCell>{spec.firstColumn.render(r)}</TableCell>
                  ) : (
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {r.date ? formatDate(r.date) : '—'}
                    {r.book ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {r.book}
                        {r.paidVia ? ` · ${r.paidVia}` : r.receivedVia ? ` · ${r.receivedVia}` : ''}
                      </Typography>
                    ) : null}
                    {r.tallyVoucher ? (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Tally {r.tallyVoucher}
                      </Typography>
                    ) : null}
                  </TableCell>
                  )}
                  <TableCell>{spec.renderParty(r)}</TableCell>
                  {spec.hideAmount ? null : (
                  <TableCell align="right" sx={{ ...MONEY_SX, whiteSpace: 'nowrap' }}>
                    {r.amount != null ? formatInrExact(r.amount) : '—'}
                    {spec.renderAmountExtra ? spec.renderAmountExtra(r) : null}
                  </TableCell>
                  )}
                  <TableCell sx={{ minWidth: 280 }}>
                    {linkOf(r) ? (
                      <Link component="button" type="button" onClick={() => onOpenNote(linkOf(r).path)} sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {linkOf(r).label}
                      </Link>
                    ) : null}
                    {(r.errors || []).map((m) => (
                      <Typography key={m} variant="caption" sx={{ display: 'block', color: 'error.main' }}>
                        {m}
                      </Typography>
                    ))}
                    {(r.warnings || []).map((m) => (
                      <Typography key={m} variant="caption" sx={{ display: 'block', color: 'warning.main' }}>
                        {m}
                      </Typography>
                    ))}
                    {r.status === 'SKIPPED' ? (
                      <Typography variant="caption" color="text.secondary">
                        Not ticked — not imported
                      </Typography>
                    ) : null}
                  </TableCell>
                  {selectable ? (
                    <TableCell padding="checkbox" sx={{ pr: 1 }}>
                      <Tooltip title={r.status === 'ERROR' ? 'Fix this row' : 'Edit this row'}>
                        <IconButton
                          size="small"
                          color={r.status === 'ERROR' ? 'error' : 'default'}
                          onClick={() => onEdit(isEditing ? null : r.rowNumber)}
                          aria-label={`Edit row ${r.rowNumber}`}
                        >
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  ) : null}
                </TableRow>
                {selectable ? (
                  <TableRow>
                    <TableCell colSpan={columns} sx={{ p: 0, borderBottom: isEditing ? undefined : 'none' }}>
                      <Collapse in={isEditing} unmountOnExit>
                        <RowEditor spec={spec} row={sourceByRow.get(r.rowNumber)} saving={saving} onSave={onSaveRow} onCancel={() => onEdit(null)} />
                      </Collapse>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/**
 * A CSV import page for notes, in three steps: start from the template, upload
 * (every row is checked, nothing saved; rows can be fixed on the page and are
 * checked again), then import the ticked rows and see what was created.
 *
 * @param {{ spec: ImportSpec, importNotes: import('@tanstack/react-query').UseMutationResult }} props
 */
export function CsvImportPage({ spec, importNotes }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { noun, nounPlural } = spec;

  const [step, setStep] = useState(0); // 0 upload · 1 preview · 2 done
  const [fileName, setFileName] = useState('');
  const [sourceRows, setSourceRows] = useState([]);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [fileError, setFileError] = useState(null);
  const [createdCount, setCreatedCount] = useState(0);
  const [show, setShow] = useState('ALL'); // preview filter
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(null); // row number being edited
  const [edited, setEdited] = useState(new Set());

  const reset = () => {
    setStep(0);
    setFileName('');
    setSourceRows([]);
    setResults([]);
    setSelected(new Set());
    setFileError(null);
    setCreatedCount(0);
    setShow('ALL');
    setEditing(null);
    setEdited(new Set());
    importNotes.reset();
  };

  const checkFile = async (file) => {
    if (!file) return;
    setFileError(null);
    if (!/\.csv$/i.test(file.name)) {
      setFileError('Choose a .csv file — in Excel use File › Save As › CSV UTF-8.');
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setFileError('The file is larger than 1 MB — split it into smaller files.');
      return;
    }
    const { rows, error } = spec.readImportFile(await file.text());
    if (error) {
      setFileError(error);
      return;
    }
    setFileName(file.name);
    setSourceRows(rows);
    try {
      const res = await importNotes.mutateAsync({ dryRun: true, actor: user?.name || 'You', rows });
      setResults(res.rows);
      setSelected(defaultSelection(res.rows));
      setStep(1);
    } catch (err) {
      setFileError(err.message || 'Could not check the file.');
    }
  };

  /**
   * Save one corrected row and check the whole file again (duplicates and
   * running totals are worked out across all rows). Ticks are kept; a row
   * that's fixed — no longer an error and not a duplicate — gets ticked.
   */
  const saveRow = async (updated) => {
    const nextRows = sourceRows.map((r) => (r.rowNumber === updated.rowNumber ? { ...updated } : r));
    try {
      const res = await importNotes.mutateAsync({ dryRun: true, actor: user?.name || 'You', rows: nextRows });
      const byRow = new Map(res.rows.map((r) => [r.rowNumber, r]));
      setSourceRows(nextRows);
      setResults(res.rows);
      setSelected((prev) => {
        const next = new Set([...prev].filter((n) => byRow.get(n)?.status !== 'ERROR'));
        const fixed = byRow.get(updated.rowNumber);
        if (fixed && fixed.status !== 'ERROR' && !fixed.duplicate) next.add(updated.rowNumber);
        return next;
      });
      setEdited((prev) => new Set(prev).add(updated.rowNumber));
      setEditing(null);
      setFileError(null);
    } catch (err) {
      setFileError(err.message || 'Could not check the row.');
    }
  };

  const runImport = async () => {
    try {
      const res = await importNotes.mutateAsync({
        dryRun: false,
        actor: user?.name || 'You',
        selected: [...selected],
        rows: sourceRows,
      });
      setResults(res.rows);
      setCreatedCount(res.createdCount);
      setStep(2);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      // shown from importNotes.error below
    }
  };

  const toggle = (rowNumber) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });

  const count = (status) => results.filter((r) => r.status === status).length;
  const errorRows = count('ERROR');
  const imported = results.filter((r) => r.status === 'IMPORTED');
  const createdLabel = (r) => (spec.createdLink || noteLink(spec))(r)?.label;
  const shownRows = show === 'ALL' ? results : results.filter((r) => r.status === show);
  const downloadErrors = () => downloadCsv(`${spec.fileSlug}-import-errors-${today()}.csv`, spec.errorReportCsv(results, sourceRows));

  return (
    <Box sx={{ maxWidth: 1240 }}>
      <Button startIcon={<ArrowBackIcon />} size="small" sx={{ mb: 2, color: 'text.secondary' }} onClick={() => navigate(spec.listPath)}>
        {spec.backLabel}
      </Button>
      <PageHeader title={spec.title} subtitle={spec.subtitle} />

      <Stepper activeStep={step === 2 ? 3 : step + 1} alternativeLabel sx={{ mb: 3 }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* ── 1 · Template + upload ───────────────────────────────────────── */}
      {step === 0 ? (
        <Grid container spacing={2.5}>
          <Grid size={{ xs: 12, md: 7 }}>
            <StepCard number={1} title="Start from the template" description={spec.templateDescription}>
              <Button
                variant="outlined"
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={() => downloadCsv(`${spec.fileSlug}-import-template.csv`, spec.templateCsv())}
                sx={{ mb: 2 }}
              >
                Download template
              </Button>
              <Table size="small" sx={{ '& td': { py: 0.75, borderColor: 'divider' } }}>
                <TableBody>
                  {spec.columns.map((c) => (
                    <TableRow key={c.header}>
                      <TableCell sx={{ width: 170, whiteSpace: 'nowrap' }}>
                        <Box component="code" sx={{ fontWeight: 600, fontSize: 12.5 }}>
                          {c.header}
                        </Box>
                        {c.required ? (
                          <Box component="span" sx={{ color: 'error.main' }}>
                            {' '}*
                          </Box>
                        ) : null}
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{c.hint || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </StepCard>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <StepCard
              number={2}
              title="Upload your file"
              description={`A .csv file of up to ${MAX_IMPORT_ROWS} rows (1 MB). In Excel: File › Save As › CSV UTF-8.`}
            >
              <Box
                component="label"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  checkFile(e.dataTransfer.files?.[0]);
                }}
                sx={{
                  py: 6,
                  px: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                  gap: 1,
                  borderRadius: 3,
                  border: '2px dashed',
                  borderColor: fileError ? 'error.main' : dragging ? 'success.main' : 'divider',
                  bgcolor: dragging ? 'var(--ok-bg)' : 'transparent',
                  color: dragging ? 'success.main' : 'text.secondary',
                  cursor: importNotes.isPending ? 'progress' : 'pointer',
                  transition: 'all .15s ease',
                  '&:hover': { borderColor: 'success.main', color: 'success.main', bgcolor: 'var(--ok-bg)' },
                }}
              >
                <UploadFileIcon sx={{ fontSize: 40 }} />
                <Typography variant="body1" sx={{ fontWeight: 700 }}>
                  {importNotes.isPending ? 'Checking the file…' : 'Drop your CSV here, or choose a file'}
                </Typography>
                <Typography variant="caption">Nothing is saved at this step</Typography>
                <input
                  type="file"
                  hidden
                  accept=".csv,text/csv"
                  disabled={importNotes.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    checkFile(file);
                  }}
                />
              </Box>
              {fileError ? (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {fileError}
                </Alert>
              ) : null}
            </StepCard>
          </Grid>
        </Grid>
      ) : null}

      {/* ── 2 · Preview / 3 · Result ────────────────────────────────────── */}
      {step > 0 ? (
        <Stack spacing={2}>
          {step === 2 ? (
            <Alert
              severity={createdCount ? 'success' : 'info'}
              icon={<CheckCircleIcon />}
              action={
                <Stack direction="row" spacing={1}>
                  <Button color="inherit" size="small" onClick={reset}>
                    Import another file
                  </Button>
                  <Button color="inherit" size="small" variant="outlined" onClick={() => navigate(spec.listPath)}>
                    Go to {nounPlural}
                  </Button>
                </Stack>
              }
            >
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {createdCount
                  ? `${createdCount} ${createdCount === 1 ? noun : nounPlural} created${imported.length ? ` — ${createdLabel(imported[0])}${imported.length > 1 ? ` … ${createdLabel(imported[imported.length - 1])}` : ''}` : ''}`
                  : `No ${nounPlural} were created`}
              </Typography>
              {errorRows ? (
                <Typography variant="body2">
                  {errorRows} {errorRows === 1 ? 'row' : 'rows'} with errors {errorRows === 1 ? 'was' : 'were'} not imported — download them, fix and upload again.
                </Typography>
              ) : null}
            </Alert>
          ) : null}

          <Card variant="outlined" sx={{ borderRadius: 3, p: 1.5 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap title={fileName}>
                  {fileName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {results.length} rows{' '}
                  {step === 1 ? '· fix a row with ✎ and it is checked again · rows with errors are left out · possible duplicates are unticked' : ''}
                </Typography>
              </Box>
              <ToggleButtonGroup exclusive size="small" value={show} onChange={(_, v) => v && setShow(v)} aria-label="Show rows">
                <ToggleButton value="ALL" sx={{ textTransform: 'none', fontWeight: 600 }}>
                  All {results.length}
                </ToggleButton>
                {step === 1 ? (
                  <ToggleButton value="READY" sx={{ textTransform: 'none', fontWeight: 600, color: 'success.main' }}>
                    Ready {count('READY')}
                  </ToggleButton>
                ) : (
                  <ToggleButton value="IMPORTED" sx={{ textTransform: 'none', fontWeight: 600, color: 'success.main' }}>
                    Imported {imported.length}
                  </ToggleButton>
                )}
                {step === 1 ? (
                  <ToggleButton value="WARNING" sx={{ textTransform: 'none', fontWeight: 600, color: 'warning.main' }}>
                    To check {count('WARNING')}
                  </ToggleButton>
                ) : null}
                <ToggleButton value="ERROR" sx={{ textTransform: 'none', fontWeight: 600, color: 'error.main' }}>
                  Errors {errorRows}
                </ToggleButton>
              </ToggleButtonGroup>
            </Stack>
          </Card>

          <RowsTable
            spec={spec}
            rows={shownRows}
            selectable={step === 1}
            selected={selected}
            onToggle={toggle}
            onOpenNote={(path) => navigate(path)}
            editing={editing}
            edited={edited}
            sourceByRow={new Map(sourceRows.map((r) => [r.rowNumber, r]))}
            saving={importNotes.isPending}
            onEdit={setEditing}
            onSaveRow={saveRow}
          />
          {fileError && step === 1 ? <Alert severity="error">{fileError}</Alert> : null}
          {!shownRows.length ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No rows with this status.
            </Typography>
          ) : null}

          {importNotes.isError && step === 1 ? (
            <Alert severity="error">{importNotes.error?.message || 'The import failed — nothing was saved.'}</Alert>
          ) : null}

          {/* Actions, kept in view */}
          <Card
            variant="outlined"
            sx={{
              position: 'sticky',
              bottom: 16,
              zIndex: 2,
              px: 2.5,
              py: 1.5,
              borderRadius: 3,
              display: 'flex',
              gap: 1.5,
              alignItems: 'center',
              flexWrap: 'wrap',
              boxShadow: 'var(--shadow)',
            }}
          >
            {errorRows ? (
              <Button startIcon={<FileDownloadOutlinedIcon />} onClick={downloadErrors}>
                Download rows with errors
              </Button>
            ) : null}
            {edited.size ? (
              <Button
                startIcon={<FileDownloadOutlinedIcon />}
                onClick={() => downloadCsv(fileName.replace(/\.csv$/i, '') + '-edited.csv', spec.rowsToCsv(sourceRows))}
              >
                Download file with your edits
              </Button>
            ) : null}
            <Box sx={{ flex: 1 }} />
            {step === 1 ? (
              <>
                <Button color="inherit" onClick={reset} disabled={importNotes.isPending}>
                  Choose another file
                </Button>
                <Button
                  variant="contained"
                  color="success"
                  size="large"
                  onClick={runImport}
                  disabled={!selected.size || importNotes.isPending}
                  sx={{ px: 4, fontWeight: 700 }}
                >
                  {importNotes.isPending ? 'Importing…' : `Import ${selected.size} ${selected.size === 1 ? spec.unit || 'note' : spec.units || 'notes'}`}
                </Button>
              </>
            ) : (
              <>
                <Button color="inherit" onClick={reset}>
                  Import another file
                </Button>
                <Button component={RouterLink} to={spec.listPath} variant="contained" color="success" size="large" sx={{ px: 4, fontWeight: 700 }}>
                  Go to {nounPlural}
                </Button>
              </>
            )}
          </Card>
        </Stack>
      ) : null}
    </Box>
  );
}
