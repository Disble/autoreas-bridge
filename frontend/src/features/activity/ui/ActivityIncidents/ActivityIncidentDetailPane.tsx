import dangerIcon from '@iconify-icons/solar/danger-triangle-bold-duotone';
import { AwaitingSelectionPane } from '../../../../shared/ui/AwaitingSelectionPane/AwaitingSelectionPane';
import { ActivityRunStory } from '../ActivityRunStory/ActivityRunStory';
import { ActivityIncidentDetail } from './ActivityIncidentDetail';
import type { ActivityIncidentDetailPaneProps } from './activity-incidents.types';

/**
 * The detail card's content: it rests until a pick, then shows the picked
 * incident or run, remounted for each so nothing leaks between picks.
 */
export function ActivityIncidentDetailPane({ selection }: ActivityIncidentDetailPaneProps) {
  if (selection === undefined) {
    return <AwaitingSelectionPane description="Errors and recovered runs of the last 7 days." icon={dangerIcon} title="No incident selected" />;
  }
  return selection.kind === 'incident' ? (
    <ActivityIncidentDetail incidentId={selection.id} key={selection.id} />
  ) : (
    <ActivityRunStory correlationId={selection.correlationId} key={selection.correlationId} />
  );
}
