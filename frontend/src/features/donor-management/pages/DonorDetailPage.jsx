import { useState } from 'react';
import { Box, Button, Card, Divider, IconButton, Link, Stack, Tooltip, Typography } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import UpdateRoundedIcon from '@mui/icons-material/UpdateRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { ACTIONS, PermissionGate, usePermission } from '../../../core/permissions/index.js';
import { ConfirmDialog, ErrorState, FieldSection, LoadingState, Panel, RecordHeader, StatusChip } from '../../../shared/components/index.js';
import { formatDate, formatDateTime } from '../../../lib/format/date.js';
import { useDonor, useDonorLifecycle } from '../hooks/useDonors.js';
import { useDocumentTypeName } from '../../masters/hooks/useDocumentTypes.js';
import { DONOR_ACTIVE_TONE, MODULE_ID } from '../constants.js';
import { DonorFundingList, DonorFundingStats } from '../../funding-agreements/components/DonorFundingList.jsx';

const SMALL_CAPS = { fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' };
const blank = (v) => v == null || String(v).trim() === '';

/** Copies a value to the clipboard, ticking briefly when done. */
function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — nothing to do */
    }
  };
  return (
    <Tooltip title={copied ? 'Copied' : `Copy ${label}`}>
      <IconButton size="small" onClick={copy} aria-label={`Copy ${label}`} sx={{ color: 'text.disabled', '&:hover': { color: 'text.primary' } }}>
        {copied ? <CheckRoundedIcon sx={{ fontSize: 16, color: 'success.main' }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 15 }} />}
      </IconButton>
    </Tooltip>
  );
}

/** One contact channel: icon, the value as a link, and a copy button. */
function ChannelRow({ icon: Icon, label, value, href, external = false }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minHeight: 34 }}>
      <Icon sx={{ fontSize: 18, color: 'text.secondary', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {blank(value) ? (
          <Typography variant="body2" color="text.disabled">No {label.toLowerCase()}</Typography>
        ) : (
          <Link
            href={href}
            underline="hover"
            color="inherit"
            variant="body2"
            sx={{ fontWeight: 500, overflowWrap: 'anywhere' }}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {value}
          </Link>
        )}
      </Box>
      {blank(value) ? null : <CopyButton value={value} label={label.toLowerCase()} />}
    </Stack>
  );
}

const mailto = (v) => `mailto:${v}`;
const tel = (v) => `tel:${String(v).replace(/\s+/g, '')}`;
const web = (v) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

/** Points of contact, the primary first: initial badge, name, email and phone. */
function ContactPeople({ contacts }) {
  if (!contacts.length) {
    return <Typography variant="body2" color="text.disabled">No point of contact added</Typography>;
  }
  const sorted = [...contacts].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));
  return (
    <Stack spacing={1.5} data-testid="poc-list">
      {sorted.map((c) => (
        <Stack key={c.id ?? c.email} direction="row" spacing={1.25} alignItems="flex-start">
          <Box
            aria-hidden
            sx={{
              width: 34,
              height: 34,
              flexShrink: 0,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: c.isPrimary ? 'var(--ok-bg)' : 'var(--card2)',
              color: c.isPrimary ? 'var(--ok)' : 'text.secondary',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {(c.name || '?').trim().charAt(0).toUpperCase()}
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{c.name}</Typography>
              {c.isPrimary && contacts.length > 1 ? <StatusChip label="Primary" tone="success" /> : null}
            </Stack>
            {c.email ? (
              <Link href={mailto(c.email)} underline="hover" color="text.secondary" variant="body2" sx={{ display: 'block', overflowWrap: 'anywhere' }}>
                {c.email}
              </Link>
            ) : null}
            {c.phone ? (
              <Link href={tel(c.phone)} underline="hover" color="text.secondary" variant="body2" sx={{ display: 'block' }}>
                {c.phone}
              </Link>
            ) : null}
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

/** Single donor view — /donors/:id. */
export function DonorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const donorQuery = useDonor(id);
  const documentTypeName = useDocumentTypeName();
  const lifecycle = useDonorLifecycle(id);
  const [pendingAction, setPendingAction] = useState(null);
  const { allowed: canEdit } = usePermission(ACTIONS.EDIT, MODULE_ID);

  if (donorQuery.isPending) return <LoadingState label="Loading donor…" />;
  if (donorQuery.isError) return <ErrorState error={donorQuery.error} onRetry={donorQuery.refetch} />;

  const donor = donorQuery.data;
  const foreign = donor.fundSourceDomicile === 'FOREIGN';
  const book = foreign ? 'FC · Foreign contribution' : 'LC · Local contribution';
  const cityLine = [donor.cityName, [donor.stateName, donor.postalCode].filter((v) => !blank(v)).join(' ')].filter((v) => !blank(v)).join(', ');
  const address = [donor.address, donor.address2, cityLine].filter((v) => !blank(v)).join('\n');

  const runLifecycle = async () => {
    await lifecycle.mutateAsync(pendingAction);
    setPendingAction(null);
  };

  return (
    <>
      <RecordHeader
        breadcrumbs={[
          { label: 'Donors', onClick: () => navigate('/donors') },
          { label: donor.donorCode },
        ]}
        icon={foreign ? PublicOutlinedIcon : ApartmentOutlinedIcon}
        iconHint={foreign ? 'Foreign donor' : 'Domestic donor'}
        eyebrow={donor.donorCode}
        title={donor.donorName}
        status={
          <Stack direction="row" spacing={0.75}>
            <StatusChip label={donor.isActive ? 'Active' : 'Inactive'} tone={DONOR_ACTIVE_TONE[donor.isActive] || 'neutral'} />
            {donor.fcraApplicable ? <StatusChip label="FCRA applicable" tone="warning" /> : null}
          </Stack>
        }
        meta={[
          { icon: CategoryOutlinedIcon, label: donor.donorTypeLabel || '—', strong: true, hint: 'Donor type' },
          { icon: AccountBalanceWalletOutlinedIcon, label: book, hint: 'Book' },
          { icon: PlaceOutlinedIcon, label: [donor.stateName, donor.countryName].filter(Boolean).join(', ') || '—' },
          { icon: UpdateRoundedIcon, label: `Updated ${formatDate(donor.updatedAt)}`, hint: `Created ${formatDateTime(donor.createdAt)} · Updated ${formatDateTime(donor.updatedAt)}` },
        ]}
        actions={
          <PermissionGate action={ACTIONS.EDIT} moduleId={MODULE_ID}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <Button variant="outlined" onClick={() => setPendingAction(donor.isActive ? 'deactivate' : 'activate')}>
                {donor.isActive ? 'Deactivate' : 'Activate'}
              </Button>
              <Button variant="contained" startIcon={<EditIcon />} onClick={() => navigate(`/donors/${donor.id}/edit`)}>
                Edit
              </Button>
            </Stack>
          </PermissionGate>
        }
      />

      {/* Funding first: the money at a glance, then every agreement. */}
      <DonorFundingStats donorId={donor.id} />
      <Box sx={{ mb: 2 }}>
        <DonorFundingList donorId={donor.id} canAdd={canEdit} />
      </Box>

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 340px' },
          alignItems: 'start',
        }}
      >
        {/* Main: everything about the organisation, in one card. */}
        <Panel
          title="Donor details"
          footer={`Created ${formatDateTime(donor.createdAt)} · Last updated ${formatDateTime(donor.updatedAt)}`}
        >
          <FieldSection
            first
            title="Organisation"
            fields={[
              { label: 'Legal name', value: donor.donorName },
              { label: 'Donor code', value: donor.donorCode, mono: true },
              { label: 'Donor type', value: donor.donorTypeName },
              { label: 'Book', value: book },
              { label: 'Fund source', value: donor.foreignFundSourceType, hideEmpty: !foreign },
              { label: 'FCRA', value: foreign ? (donor.fcraApplicable ? 'Applicable' : 'Not applicable') : null, hideEmpty: !foreign },
            ]}
          />
          <FieldSection
            title="Registration & identity"
            fields={[
              { label: 'Registration no.', value: donor.registrationNumber, mono: true },
              { label: donor.idType ? documentTypeName(donor.idType) || 'ID document' : 'ID document', value: donor.idNumber, mono: true },
              { label: 'Passport ID', value: donor.passportNumber, mono: true, hideEmpty: !foreign },
            ]}
          />
          <FieldSection
            title="Address"
            fields={[
              // One formatted block: street lines, then "City, State PIN"; country beside it.
              { label: 'Address', value: address, emptyText: 'Not added', wide: false, span: 2 },
              { label: 'Country', value: donor.countryName },
            ]}
          />
        </Panel>

        {/* Side: how to reach them. */}
        <Panel title="Contact">
          <Stack divider={<Divider flexItem sx={{ borderColor: 'var(--line2)' }} />} spacing={0.25}>
            <ChannelRow icon={MailOutlineRoundedIcon} label="Email" value={donor.email} href={blank(donor.email) ? undefined : mailto(donor.email)} />
            <ChannelRow icon={PhoneOutlinedIcon} label="Phone" value={donor.phoneNumber} href={blank(donor.phoneNumber) ? undefined : tel(donor.phoneNumber)} />
            <ChannelRow icon={LanguageOutlinedIcon} label="Website" value={donor.website} href={blank(donor.website) ? undefined : web(donor.website)} external />
          </Stack>
          <Typography sx={{ ...SMALL_CAPS, mt: 2.5, mb: 1.25 }}>
            {donor.contacts.length > 1 ? `Points of contact · ${donor.contacts.length}` : 'Point of contact'}
          </Typography>
          <ContactPeople contacts={donor.contacts} />
        </Panel>
      </Box>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction === 'activate' ? 'Activate donor' : 'Deactivate donor'}
        description={
          pendingAction === 'activate'
            ? `Reactivate ${donor.donorName}? The donor becomes available for new mappings.`
            : `Deactivate ${donor.donorName}? Existing grants remain, but the donor is excluded from new activity.`
        }
        confirmLabel={pendingAction === 'activate' ? 'Activate' : 'Deactivate'}
        confirmColor={pendingAction === 'activate' ? 'primary' : 'error'}
        busy={lifecycle.isPending}
        onConfirm={runLifecycle}
        onClose={() => setPendingAction(null)}
      />
    </>
  );
}
