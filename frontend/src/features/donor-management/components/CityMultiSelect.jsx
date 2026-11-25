import { useEffect, useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useWatch } from 'react-hook-form';
import { RhfMultiSelect } from '../../../shared/components/form/RhfMultiSelect.jsx';
import { geographyService } from '../services/geographyService.js';

/** "stateId:cityId" — a city option's value, so the mapper knows its state without a lookup. */
export const cityValue = (stateId, cityId) => `${stateId}:${cityId}`;

/** "12:45" → { stateId: 12, cityId: 45 } (null if malformed). */
export function parseCityValue(value) {
  const [stateId, cityId] = String(value).split(':').map(Number);
  return Number.isFinite(stateId) && Number.isFinite(cityId) ? { stateId, cityId } : null;
}

/**
 * Optional cities within the selected states. A state with no city picked is
 * allowed whole; picking cities narrows that state to just those cities.
 * Cities of a state that is deselected are dropped from the selection.
 */
export function CityMultiSelect({ control, setValue, name = 'selectedCities', stateIds, stateNameById }) {
  const states = useMemo(() => (stateIds || []).map(String), [stateIds]);
  const stateKey = states.join(',');

  const cityQueries = useQueries({
    queries: states.map((stateId) => ({
      queryKey: ['geography', 'cities', stateId],
      queryFn: () => geographyService.listCities(stateId),
      staleTime: 1000 * 60 * 60,
    })),
  });

  const options = cityQueries.flatMap((query, i) =>
    (query.data || []).map((city) => ({
      value: cityValue(states[i], city.value),
      label: states.length > 1 ? `${city.label} · ${stateNameById.get(states[i]) || ''}` : city.label,
    })),
  );
  const loading = cityQueries.some((q) => q.isPending);
  const noCities = !loading && options.length === 0;

  // A deselected state takes its cities with it.
  const selected = useWatch({ control, name }) || [];
  useEffect(() => {
    const allowed = new Set(states);
    const kept = selected.filter((v) => allowed.has(String(parseCityValue(v)?.stateId)));
    if (kept.length !== selected.length) setValue(name, kept, { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the selected states change
  }, [stateKey]);

  return (
    <RhfMultiSelect
      name={name}
      control={control}
      label="Cities (optional)"
      options={options}
      helperText={
        loading
          ? 'Loading cities…'
          : noCities
            ? 'No cities on record for the selected states — the whole state applies'
            : 'Leave empty to allow the whole state, or pick cities to allow only those'
      }
    />
  );
}
