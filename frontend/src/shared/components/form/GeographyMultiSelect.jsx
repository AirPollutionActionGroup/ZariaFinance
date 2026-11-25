import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RhfMultiSelect } from './RhfMultiSelect.jsx';
import { geographyService } from '../../../features/donor-management/services/geographyService.js';

/**
 * Reusable API-connected Multi-Select for States/UTs + "All". Option values
 * are numeric state ids (geographyService.listStates() already maps
 * {value: state.id, label: state.stateName}) — every consumer sends these
 * straight through as stateIds, not names.
 *
 * "All" means unrestricted — the field submits as an empty list (e.g. a fund
 * profile with no geography restriction).
 */
export function GeographyMultiSelect({
  name = 'selectedGeographies',
  control,
  label = 'Geography name',
  required = false,
  helperText,
  // Optional: limit the choices to these state ids (e.g. a programme's states).
  // When set, "All" is hidden — only the listed states can be picked.
  allowedStateIds = null,
}) {
  const { data: apiStates } = useQuery({
    queryKey: ['geography', 'states'],
    queryFn: () => geographyService.listStates(),
    staleTime: 1000 * 60 * 60,
  });

  const restricted = Array.isArray(allowedStateIds) && allowedStateIds.length > 0;
  const allowedKey = restricted ? allowedStateIds.join(',') : '';
  const options = useMemo(() => {
    if (restricted) {
      const allowed = new Set(allowedKey.split(','));
      return (apiStates || []).filter((s) => allowed.has(String(s.value)));
    }
    return [{ value: 'ALL', label: 'All (Spendable anywhere)' }, ...(apiStates || [])];
  }, [apiStates, restricted, allowedKey]);

  // "All" is exclusive of specific states either way: picking it drops
  // whatever states were already selected, and picking a state while "All"
  // is active drops "All" rather than silently keeping both (the mapper would
  // otherwise treat the selection as "All" and discard the states unnoticed).
  const transformSelection = (values, previousValues) => {
    const hadAll = (previousValues || []).includes('ALL');
    const hasAll = values.includes('ALL');
    if (hasAll && !hadAll) {
      return ['ALL'];
    }
    if (hasAll && hadAll && values.length > 1) {
      return values.filter((v) => v !== 'ALL');
    }
    return values;
  };

  const defaultHelperText =
    "Select Indian states / UTs, or select All (defaults to 'No geographies — spendable anywhere' if left blank)";

  return (
    <RhfMultiSelect
      name={name}
      control={control}
      label={label}
      options={options}
      required={required}
      helperText={helperText ?? defaultHelperText}
      transformSelection={transformSelection}
    />
  );
}
