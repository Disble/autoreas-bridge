import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ActivityIncidentList } from './ActivityIncidentList';
import type { ActivityIncidentListResolvedProps } from './activity-incidents.types';

/**
 * The resolved list: its rows, or the empty state that fits the filter, a
 * "Show all" way out of a filtered one.
 */
export function ActivityIncidentListResolved({ entries, isFiltered, onClearFilter, ...list }: ActivityIncidentListResolvedProps) {
  if (entries.length > 0) {
    return <ActivityIncidentList entries={entries} {...list} />;
  }
  return isFiltered ? (
    <AirisEmptyState
      action={{ label: 'Show all', onPress: onClearFilter }}
      description="Nothing went wrong here in the last 7 days."
      kind="filtered"
      size="section"
      title="No incidents for this filter"
    />
  ) : (
    <AirisEmptyState description="Errors and recovered runs of the last 7 days show here." kind="caught-up" size="section" title="No incidents in the last 7 days" />
  );
}
