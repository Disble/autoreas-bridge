import { ActivityScreen } from '../../features/activity/ui/ActivityScreen/ActivityScreen';
import { PageHeader } from '../../shared/ui/PageHeader/PageHeader';

/**
 * ActivityRoute is the single destination for Activity and for the retired
 * Status, Network and Events deep links. The screen is one feed with its
 * detail drawer; nothing inside it is a route of its own.
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
