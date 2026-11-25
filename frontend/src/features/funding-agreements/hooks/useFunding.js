import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/queryKeys.js';
import { useInflowBudgetLines } from '../../inflow-budget/hooks/useInflowBudget.js';
import { useDebitNotes } from '../../debit-notes/hooks/useDebitNotes.js';
import { useCreditNotes } from '../../credit-notes/hooks/useCreditNotes.js';
import { fundingService } from '../services/fundingService.js';

/** Every funding record (fund profile + its agreement), joined and staged by the server. */
export function useFundingRecords(filters = {}) {
  const query = useQuery({
    queryKey: queryKeys.funding.list(filters),
    queryFn: () => fundingService.list(filters),
  });
  return {
    records: query.data || [],
    isPending: query.isPending,
    error: query.isError ? query.error : null,
    refetch: query.refetch,
  };
}

/** A donor's funding records (list rows) — e.g. the fund pickers on credit / debit notes. Off until a donor is chosen. */
export function useDonorFunding(donorId) {
  return useQuery({
    queryKey: queryKeys.funding.list({ donorId }),
    queryFn: () => fundingService.list({ donorId }),
    enabled: donorId != null && donorId !== '',
  });
}

/**
 * The agreement's status steps on funding record `profileId`:
 * mutate({ action: 'approve' | 'activate' | 'hold' | 'resume' | 'complete' | 'close', payload, actor }).
 */
export function useFundingStatusStep(profileId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, payload, actor } = {}) => fundingService.statusStep(profileId, action, payload, actor),
    onSuccess: () => {
      // The record, its list row, its history and the dashboard all show the stage.
      queryClient.invalidateQueries({ queryKey: queryKeys.funding.all() });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

/**
 * One funding record, keyed by fund profile id: { profile, grant, stage }.
 * `grant` is null until an agreement exists. Disabled when profileId is empty.
 */
/** A funding record's change history (each save and status step), newest first. */
export function useFundingHistory(profileId) {
  return useQuery({
    queryKey: queryKeys.funding.history(profileId),
    queryFn: () => fundingService.history(profileId),
    enabled: profileId != null && profileId !== '',
  });
}

export function useFundingRecord(profileId) {
  const query = useQuery({
    queryKey: queryKeys.funding.detail(profileId),
    queryFn: () => fundingService.get(profileId),
    enabled: profileId != null && profileId !== '',
  });
  return {
    profile: query.data?.profile || null,
    grant: query.data?.grant || null,
    stage: query.data?.stage || null,
    query,
  };
}

/**
 * Money that has moved against a grant: received (inflow-budget actuals on the
 * profile's tranches), spent (debit notes) and the combined note ledger.
 * Received = actuals on the profile's tranches; spent = debit notes on the grant.
 */
export function useFundingMoney(grant, profile) {
  const inflowLinesQuery = useInflowBudgetLines();
  const debitNotesQuery = useDebitNotes();
  const creditNotesQuery = useCreditNotes();

  const sameId = (a, b) => a != null && b != null && String(a) === String(b);
  const onThisGrant = (n) =>
    grant != null &&
    (sameId(n.grant?.id, grant.id) || (!n.grant && sameId(n.fundProfile?.id, grant.fundProfileId ?? profile?.id)));

  const noteRows = (notes, type) =>
    (notes || []).filter(onThisGrant).map((n) => ({
      id: n.id,
      type,
      date: n.date,
      amount: n.amount,
      partyName: type === 'DEBIT' ? n.payee?.name || '—' : n.donor?.name || '—',
      paymentModeLabel: n.paymentMode?.name || '—',
      reference: n.reference,
      bankAccount: n.bankAccount?.name || null,
      // What it is for: the tranche a receipt was booked to, or the budget line a payment was charged to.
      purpose:
        type === 'DEBIT'
          ? [n.outflowLineId || n.lineCode, n.line].filter(Boolean).join(' · ') || null
          : n.tranche?.name
            ? String(n.tranche.name).split(/\s+[—–-]\s+/)[0]
            : null,
      foreign: n.currency && n.foreignAmount != null ? { currency: n.currency, amount: Number(n.foreignAmount) } : null,
      remarks: n.remarks || null,
      href: `/${type === 'DEBIT' ? 'debit' : 'credit'}-notes/${n.id}`,
    }));

  const transactions = [
    ...noteRows(debitNotesQuery.data, 'DEBIT'),
    ...noteRows(creditNotesQuery.data, 'CREDIT'),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  const trancheIds = new Set(
    (profile?.disbursementRules || []).flatMap((r) => (r.trancheCriteria || []).map((t) => String(t.id))),
  );
  const trancheLines = (inflowLinesQuery.data || []).filter((line) => trancheIds.has(String(line.id)));
  const received = trancheLines.reduce((sum, line) => sum + (Number(line.actualAmount) || 0), 0);
  // Per tranche (inflow line id = tranche id): what came in and when.
  const receivedByTranche = Object.fromEntries(
    trancheLines.map((line) => [String(line.id), { amount: Number(line.actualAmount) || 0, date: line.actualDate || null }]),
  );
  const spent = transactions
    .filter((t) => t.type === 'DEBIT')
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

  const queries = [debitNotesQuery, creditNotesQuery, inflowLinesQuery];
  const failed = queries.find((q) => q.isError);
  return {
    transactions,
    received,
    receivedByTranche,
    spent,
    isLoading: queries.some((q) => q.isPending),
    error: failed ? failed.error : null,
    retry: () => queries.forEach((q) => q.isError && q.refetch()),
  };
}
