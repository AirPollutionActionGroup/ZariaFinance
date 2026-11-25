import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/queryKeys.js';
import { debitNoteApi } from '../api/debitNoteApi.js';
import { fromNoteResponse, toCreateNoteRequest } from '../mappers/noteMapper.js';

export function useDebitNotes() {
  return useQuery({
    queryKey: queryKeys.debitNotes.list(),
    queryFn: async () => (await debitNoteApi.list()).map(fromNoteResponse),
  });
}

export function useDebitNote(code) {
  return useQuery({
    queryKey: queryKeys.debitNotes.detail(code),
    queryFn: async () => fromNoteResponse(await debitNoteApi.getByCode(code)),
    enabled: Boolean(code),
  });
}

/** A debit note changes the outflow row's Spent — refresh notes and the schedule. */
function useInvalidateNotesAndOutflow() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.debitNotes.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.creditNotes.all() }),
      queryClient.invalidateQueries({ queryKey: queryKeys.outflow.all() }),
    ]);
}

export function useCreateDebitNote() {
  const invalidate = useInvalidateNotesAndOutflow();
  return useMutation({
    mutationFn: async ({ input, actor }) => fromNoteResponse(await debitNoteApi.create(toCreateNoteRequest(input, { actor }))),
    onSuccess: invalidate,
  });
}

/** Check (dryRun) or import CSV rows. Caches are refreshed only after a real import. */
export function useImportDebitNotes() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateNotesAndOutflow();
  return useMutation({
    mutationFn: (payload) => debitNoteApi.importRows(payload),
    onSuccess: (data) => {
      if (data?.dryRun) return;
      invalidate();
      // Debits charged to a fund change its balance on the funding records.
      queryClient.invalidateQueries({ queryKey: queryKeys.funding.all() });
    },
  });
}
