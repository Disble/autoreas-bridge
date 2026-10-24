import { ActivityScreen } from '../../features/activity/ui/ActivityScreen/ActivityScreen';

/**
 * ActivityRoute is the single destination for Activity and for the retired
 * Status, Network and Events deep links. The screen is one feed with its
 * detail drawer and owns its own header, because "Pin this moment" sits in
 * it; nothing inside it is a route of its own.
 */
export function ActivityRoute() {
  return (
    <div className="min-w-0">
      <ActivityScreen />
    </div>
  );
}
