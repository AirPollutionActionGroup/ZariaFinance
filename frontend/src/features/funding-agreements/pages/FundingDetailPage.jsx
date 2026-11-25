import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  Divider,
  Link,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import PauseCircleOutlineRoundedIcon from '@mui/icons-material/PauseCircleOutlineRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import HandshakeOutlinedIcon from '@mui/icons-material/HandshakeOutlined';
import VolunteerActivismOutlinedIcon from '@mui/icons-material/VolunteerActivismOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { ACTIONS, PermissionGate } from '../../../core/permissions/index.js';
import { ConfirmDialog, ErrorState, LoadingState, RecordHeader, StatStrip, StatusChip } from '../../../shared/components/index.js';
import { formatDate, formatDateTime } from '../../../lib/format/date.js';
import { formatInrExact } from '../../../lib/format/currency.js';
import { useDonor } from '../../donor-management/hooks/useDonors.js';
import { FUND_CLASS_CODE_LABEL, FUND_CLASS_CODE_TONE } from '../../donor-management/constants.js';
import {
  PaymentSchedule,
  SpendingRules,
  findIssues,
} from '../components/FundingTermsSections.jsx';
import { ACTION_COPY } from '../components/FundingAgreementParts.jsx';
import { FundingTransactions } from '../components/FundingTransactions.jsx';
import { FundingOverview } from '../components/FundingOverview.jsx';
import { useFundingHistory, useFundingMoney, useFundingRecord, useFundingStatusStep } from '../hooks/useFunding.js';
import { FundingHistory } from '../components/FundingHistory.jsx';
import { useAuth } from '../../../core/auth/index.js';
import { LifecycleTracker } from '../components/LifecycleTracker.jsx';
import { STAGE_BY_KEY, agreementActions, classLetter } from '../lib/fundingRecords.js';
import { CLASS_NAME, MODULE_ID } from '../constants.js';

const DAY = 24 * 60 * 60 * 1000;
/** Days until a date (negative = past). Kept outside render. */
const daysUntil = (iso) => Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / DAY);

/** Header: donor › record, its stage and class, key facts, Edit — and the lifecycle with its actions underneath. */
function FundingHeader({ profile, grant, stage, donor, onAction }) {
  const navigate = useNavigate();
  const code = classLetter(profile, grant);
  const stageInfo = STAGE_BY_KEY[stage];
  const actions = grant ? agreementActions(grant.isApproved, grant.isActive) : [];
  const rule = profile.disbursementRules?.[0];
  const foreign = donor ? donor.fundSourceDomicile === 'FOREIGN' : Boolean(rule?.foreign);
  const dates = (rule?.trancheCriteria || []).map((t) => t.expectedReleaseDate).filter(Boolean).sort();
  const period = grant
    ? `${formatDate(grant.startDate)} → ${formatDate(grant.endDate)}`
    : dates.length
      ? `Payments ${formatDate(dates[0])}${dates.length > 1 ? ` → ${formatDate(dates[dates.length - 1])}` : ''}`
      : 'No dates yet';
  const ends = grant?.endDate && stage !== 'completed' ? daysUntil(grant.endDate) : null;

  return (
    <RecordHeader
      breadcrumbs={[
        { label: 'Funding Agreements', onClick: () => navigate('/funding') },
        { label: profile.donorName, onClick: () => navigate(`/donors/${profile.donorId}`) },
        { label: grant?.grantCode || profile.profileCode },
      ]}
      icon={HandshakeOutlinedIcon}
      iconHint="Funding agreement"
      eyebrow={[profile.profileCode, grant?.grantCode].filter(Boolean).join('  ·  ')}
      title={grant?.agreementName || profile.purpose || profile.profileCode}
      status={
        <Stack direction="row" spacing={0.75}>
          <StatusChip label={stageInfo.label} tone={stageInfo.tone} />
          {code ? (
            <Tooltip title={FUND_CLASS_CODE_LABEL[code]} describeChild>
              <span>
                <StatusChip label={`Class ${code} · ${CLASS_NAME[code]}`} tone={FUND_CLASS_CODE_TONE[code]} />
              </span>
            </Tooltip>
          ) : (
            <StatusChip label="Class not set" tone="warning" />
          )}
        </Stack>
      }
      meta={[
        {
          icon: VolunteerActivismOutlinedIcon,
          strong: true,
          hint: 'Donor',
          label: (
            <Link component={RouterLink} to={`/donors/${profile.donorId}`} underline="hover" color="inherit">
              {profile.donorName}
            </Link>
          ),
        },
        { icon: CalendarMonthOutlinedIcon, label: period, hint: grant ? 'Agreement period' : 'Expected payment dates' },
        ...(ends != null && ends <= 60
          ? [{ dot: ends < 0 ? 'var(--err)' : 'var(--warn)', label: ends < 0 ? `Ended ${-ends} days ago` : `Ends in ${ends} days` }]
          : []),
        {
          icon: AccountBalanceWalletOutlinedIcon,
          label: foreign ? `FC${rule?.currency ? ` · ${rule.currency}` : ''}` : 'LC',
          hint: foreign ? 'Foreign contribution book' : 'Local contribution book',
        },
        { icon: AccountTreeOutlinedIcon, label: profile.programmeName || 'Any programme', hint: 'Programme' },
      ]}
      actions={
        <>
          <PermissionGate action={ACTIONS.EDIT} moduleId={MODULE_ID}>
            {/* No agreement yet: "Record agreement" lives in the callout under the header. */}
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => navigate(`/funding/${profile.id}/edit`)}>
              Edit
            </Button>
          </PermissionGate>
          <PermissionGate action={ACTIONS.APPROVE} moduleId={MODULE_ID}>
            <StatusActions actions={actions} onAction={onAction} />
          </PermissionGate>
        </>
      }
      footer={<LifecycleTracker stage={stage} profile={profile} grant={grant} />}
    />
  );
}

/** Which status step is the main next one — shown as a button; the rest go under "More". */
const PRIMARY_ORDER = ['approve', 'resume', 'activate', 'complete'];

/**
 * The status actions: one filled button for the natural next step, and the
 * others (hold, close) in a "More" menu — so a rare or final step like Close
 * isn't one stray click away.
 */
function StatusActions({ actions, onAction }) {
  const [anchor, setAnchor] = useState(null);
  if (!actions.length) return null;
  const primary = PRIMARY_ORDER.find((a) => actions.includes(a)) || null;
  const rest = actions.filter((a) => a !== primary);
  const PrimaryIcon = primary ? ACTION_ICON[primary] : null;
  const pick = (action) => {
    setAnchor(null);
    onAction(action);
  };
  return (
    <>
      {primary ? (
        <Button
          variant="contained"
          color={ACTION_COPY[primary].color}
          startIcon={PrimaryIcon ? <PrimaryIcon /> : null}
          onClick={() => onAction(primary)}
        >
          {ACTION_COPY[primary].label}
        </Button>
      ) : null}
      {rest.length ? (
        <>
          <Button
            variant="outlined"
            color="inherit"
            aria-haspopup="menu"
            aria-expanded={anchor ? 'true' : undefined}
            aria-controls={anchor ? 'funding-status-menu' : undefined}
            endIcon={<ExpandMoreRoundedIcon />}
            onClick={(e) => setAnchor(e.currentTarget)}
            sx={{ borderColor: 'var(--line)' }}
          >
            More
          </Button>
          <Menu
            id="funding-status-menu"
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            slotProps={{ paper: { sx: { minWidth: 220, mt: 0.5 } } }}
          >
            {rest.map((action, i) => {
              const Icon = ACTION_ICON[action];
              const danger = action === 'close';
              return [
                danger && i > 0 ? <Divider key={`${action}-divider`} /> : null,
                <MenuItem key={action} onClick={() => pick(action)} sx={danger ? { color: 'error.main' } : undefined}>
                  {Icon ? (
                    <ListItemIcon sx={{ color: danger ? 'error.main' : action === 'hold' ? 'var(--warn)' : undefined }}>
                      <Icon fontSize="small" />
                    </ListItemIcon>
                  ) : null}
                  <ListItemText primary={ACTION_COPY[action].label} secondary={ACTION_HINT[action]} />
                </MenuItem>,
              ];
            })}
          </Menu>
        </>
      ) : null}
    </>
  );
}

const ACTION_ICON = {
  approve: CheckCircleOutlineRoundedIcon,
  resume: PlayCircleOutlineRoundedIcon,
  activate: PlayCircleOutlineRoundedIcon,
  complete: TaskAltRoundedIcon,
  hold: PauseCircleOutlineRoundedIcon,
  close: BlockRoundedIcon,
};
const ACTION_HINT = {
  hold: 'Pause it for review',
  close: 'Stop it — no more transactions',
  complete: 'The grant has run its course',
};

/** The money at a glance, in full rupees: committed, received, still to come, spent and what is left to spend. */
function MoneyStats({ committed, received, spent, debitCount, rule, receivedByTranche }) {
  const total = Number(committed) || 0;
  const pctIn = total > 0 ? Math.round((received / total) * 100) : null;
  const open = (rule?.trancheCriteria || [])
    .filter((t) => (receivedByTranche[String(t.id)]?.amount || 0) < (Number(t.amountCriteria) || 0))
    .sort((a, b) => String(a.expectedReleaseDate || '9999').localeCompare(String(b.expectedReleaseDate || '9999')));
  const next = open[0];
  const toCome = Math.max(0, total - received);
  const available = received - spent;
  const fc = rule?.foreign && rule.currency ? `${rule.currency} ${Number(rule.foreignAmount || 0).toLocaleString('en-IN')}` : null;

  return (
    <StatStrip
      sx={{ mb: 2 }}
      stats={[
        { label: 'Committed', value: formatInrExact(total), note: fc ? `${fc} · signed agreement` : 'Signed agreement' },
        { label: 'Received', value: formatInrExact(received), color: received > 0 ? 'success.main' : undefined, note: pctIn != null ? `${pctIn}% of committed` : null },
        {
          label: 'Still to receive',
          value: formatInrExact(toCome),
          note: next?.expectedReleaseDate ? `Next ${formatDate(next.expectedReleaseDate)} · ${formatInrExact(next.amountCriteria)}` : toCome > 0 ? 'No date set' : 'All received',
        },
        { label: 'Spent', value: formatInrExact(spent), color: spent > 0 ? 'error.main' : undefined, note: debitCount === 1 ? '1 debit note' : `${debitCount} debit notes` },
        { label: 'Available', value: formatInrExact(available), color: available < 0 ? 'error.main' : undefined, note: 'Received − spent' },
      ]}
      footer={
        total > 0 ? (
          <Tooltip title={`Received ${pctIn}% · spent ${Math.round((spent / total) * 100)}% of committed`} describeChild>
            <Box role="img" aria-label={`Received ${pctIn}% of committed`} sx={{ position: 'relative', height: 5, bgcolor: 'var(--card2)' }}>
              <Box sx={{ position: 'absolute', inset: 0, width: `${Math.min(100, (received / total) * 100)}%`, bgcolor: 'success.main', opacity: 0.85 }} />
              <Box sx={{ position: 'absolute', inset: 0, width: `${Math.min(100, (spent / total) * 100)}%`, bgcolor: 'error.main' }} />
            </Box>
          </Tooltip>
        ) : null
      }
    />
  );
}

/** Shown in place of the money strip until an agreement exists. */
function NoAgreementCallout({ profileId }) {
  const navigate = useNavigate();
  return (
    <Card
      sx={{
        mb: 2,
        px: { xs: 2, md: 3 },
        py: 2,
        display: 'flex',
        gap: 2,
        alignItems: 'center',
        flexWrap: 'wrap',
        borderStyle: 'dashed',
      }}
    >
      <DescriptionOutlinedIcon sx={{ color: 'var(--info)' }} />
      <Box sx={{ flex: 1, minWidth: 220 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          No grant agreement yet
        </Typography>
        <Typography variant="body2" color="text.secondary">
          The terms are in place. Record the signed agreement to start approval and track money received and spent.
        </Typography>
      </Box>
      <PermissionGate action={ACTIONS.EDIT} moduleId={MODULE_ID}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate(`/funding/${profileId}/edit?step=agreement`)}>
          Record agreement
        </Button>
      </PermissionGate>
    </Card>
  );
}

function IssuesBanner({ issues, profileId }) {
  const navigate = useNavigate();
  if (!issues.length) return null;
  return (
    <Stack
      direction="row"
      spacing={1.5}
      sx={{ mb: 2, px: 2, py: 1.25, borderRadius: 2, bgcolor: 'var(--warn-bg)', alignItems: 'flex-start' }}
    >
      <WarningAmberRoundedIcon sx={{ fontSize: 18, color: 'var(--warn)', mt: '2px' }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {issues.length === 1 ? '1 thing to check in the terms' : `${issues.length} things to check in the terms`}
        </Typography>
        {issues.map((issue) => (
          <Typography key={issue} variant="body2" sx={{ fontSize: 13, color: 'text.secondary' }}>
            • {issue}
          </Typography>
        ))}
      </Box>
      <PermissionGate action={ACTIONS.EDIT} moduleId={MODULE_ID}>
        <Button
          size="small"
          onClick={() => navigate(`/funding/${profileId}/edit`)}
          sx={{ color: 'var(--warn)', fontWeight: 600, whiteSpace: 'nowrap' }}
        >
          Fix →
        </Button>
      </PermissionGate>
    </Stack>
  );
}

/** One funding record — /funding/:id (id = fund profile id). */
export function FundingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile, grant, stage, query: recordQuery } = useFundingRecord(id);
  const donorQuery = useDonor(profile?.donorId);
  const money = useFundingMoney(grant, profile);
  const lifecycle = useFundingStatusStep(id);
  const historyQuery = useFundingHistory(id);
  const { user } = useAuth();
  const [tab, setTab] = useState('overview');
  const [pendingAction, setPendingAction] = useState(null);
  const [remarks, setRemarks] = useState('');

  if (recordQuery.isPending) return <LoadingState label="Loading funding…" />;
  if (recordQuery.isError) return <ErrorState error={recordQuery.error} onRetry={recordQuery.refetch} />;

  const issues = findIssues(profile);

  const closeDialog = () => {
    setPendingAction(null);
    setRemarks('');
  };
  const runLifecycle = async () => {
    const payload =
      pendingAction === 'approve' || pendingAction === 'hold' ? { remarks: remarks.trim() || undefined } : undefined;
    await lifecycle.mutateAsync({ action: pendingAction, payload, actor: user?.name });
    closeDialog();
  };

  const tabs = [
    { value: 'overview', label: 'Overview' },
    { value: 'rules', label: 'Schedule & rules' },
    ...(grant ? [{ value: 'transactions', label: `Transactions${money.transactions.length ? ` · ${money.transactions.length}` : ''}` }] : []),
    { value: 'history', label: `History${historyQuery.data?.length ? ` · ${historyQuery.data.length}` : ''}` },
  ];
  const activeTab = tabs.some((t) => t.value === tab) ? tab : 'overview';

  return (
    <>
      <FundingHeader profile={profile} grant={grant} stage={stage} donor={donorQuery.data} onAction={setPendingAction} />

      {grant ? (
        <MoneyStats
          committed={grant.totalGrantAmount}
          received={money.received}
          spent={money.spent}
          debitCount={money.transactions.filter((t) => t.type === 'DEBIT').length}
          rule={profile.disbursementRules?.[0]}
          receivedByTranche={money.receivedByTranche}
        />
      ) : (
        <NoAgreementCallout profileId={profile.id} />
      )}

      <IssuesBanner issues={issues} profileId={profile.id} />

      <Tabs
        value={activeTab}
        onChange={(_e, value) => setTab(value)}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
        sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider', minHeight: 40, '& .MuiTab-root': { minHeight: 40, textTransform: 'none', fontWeight: 600 } }}
      >
        {tabs.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {activeTab === 'overview' ? (
        <FundingOverview
          profile={profile}
          grant={grant}
          donor={donorQuery.data}
          receivedByTranche={money.receivedByTranche}
          historyQuery={historyQuery}
          onShowHistory={() => setTab('history')}
        />
      ) : null}
      {activeTab === 'rules' ? (
        <>
          <PaymentSchedule profile={profile} receivedByTranche={money.receivedByTranche} hasAgreement={Boolean(grant)} />
          <SpendingRules profile={profile} />
        </>
      ) : null}
      {activeTab === 'transactions' && grant ? (
        <FundingTransactions
          transactions={money.transactions}
          isLoading={money.isLoading}
          error={money.error}
          onRetry={money.retry}
          navigate={navigate}
          exportName={`transactions-${grant.grantCode}`}
        />
      ) : null}
      {activeTab === 'history' ? <FundingHistory query={historyQuery} exportName={`change-history-${grant?.grantCode || profile.profileCode}`} /> : null}

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
        {/* The change log knows the latest change of any kind (terms, agreement or status). */}
        Created {formatDateTime(profile.createdAt)}
        {historyQuery.data?.[0]
          ? ` · last change ${formatDateTime(historyQuery.data[0].changedAt)}${historyQuery.data[0].changedBy ? ` by ${historyQuery.data[0].changedBy}` : ''}`
          : ` · last updated ${formatDateTime(profile.updatedAt)}`}
      </Typography>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction ? ACTION_COPY[pendingAction].title : ''}
        description={pendingAction ? ACTION_COPY[pendingAction].description : ''}
        confirmLabel={pendingAction ? ACTION_COPY[pendingAction].label : ''}
        confirmColor={pendingAction ? ACTION_COPY[pendingAction].color : 'primary'}
        busy={lifecycle.isPending}
        onConfirm={runLifecycle}
        onClose={closeDialog}
      >
        {pendingAction === 'approve' || pendingAction === 'hold' ? (
          <TextField
            label="Remarks (optional)"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            multiline
            minRows={2}
            fullWidth
            sx={{ mt: 2 }}
          />
        ) : null}
      </ConfirmDialog>
    </>
  );
}
