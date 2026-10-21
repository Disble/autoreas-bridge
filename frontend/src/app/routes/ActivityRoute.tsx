import { ActivityScreen } from '../../features/activity/ui/ActivityScreen/ActivityScreen';
import { PageHeader } from '../../shared/ui/PageHeader/PageHeader';

/**
 * ActivityRoute is the single destination for Activity and for the retired
 * Status, Network and Events deep links. The Now, Incidents and History views
 * are tabs inside the screen, never routes of their own.
 */
export function ActivityRoute() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Activity" />
      <div className="min-w-0">
        <ActivityScreen />
      </div>
    </div>
  );
}
