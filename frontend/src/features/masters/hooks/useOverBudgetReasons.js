import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/query/queryKeys.js';
import { overBudgetReasonService } from '../services/overBudgetReasonService.js';

export function useOverBudgetReasons(search) {
  return useQuery({
    queryKey: queryKeys.overBudgetReasons.list(search, false),
    queryFn: () => overBudgetReasonService.listReasons(search),
  });
}

/** Active reasons, for the debit note form's "Over-budget reason" dropdown. */
export function useActiveOverBudgetReasons() {
  return useQuery({
    queryKey: queryKeys.overBudgetReasons.list('', true),
    queryFn: () => overBudgetReasonService.listActiveReasons(),
  });
}

function useInvalidating(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.overBudgetReasons.all() }),
  });
}

export function useCreateOverBudgetReason() {
  return useInvalidating((values) => overBudgetReasonService.createReason(values));
}

export function useUpdateOverBudgetReason() {
  return useInvalidating(({ id, values }) => overBudgetReasonService.updateReason(id, values));
}

/** activate | deactivate with shared invalidation. */
export function useOverBudgetReasonLifecycle() {
  return useInvalidating(({ id, action }) =>
    action === 'activate' ? overBudgetReasonService.activateReason(id) : overBudgetReasonService.deactivateReason(id),
  );
}
