import { Typography } from '@heroui/react';
import { ActivityScreen } from '../../features/activity/ui/ActivityScreen/ActivityScreen';

/**
 * ActivityRoute is the single destination for Activity and for the retired
 * Status, Network and Events deep links. The Now, Incidents and History views
 * are tabs inside the screen, never routes of their own.
 */
export function ActivityRoute() {
  return (
    <div className="flex flex-col gap-4">
      <Typography type="h1">Activity</Typography>
      <div className="min-w-0">
        <ActivityScreen />
      </div>
    </div>
  );
}
