import { ActivityDetailDrawerPanel } from './ActivityDetailDrawerPanel';
import type { ActivityDetailDrawerProps } from './activity-detail-drawer.types';

/**
 * The Activity detail drawer: renders nothing while closed. The open panel
 * stays mounted while the screen switches lines, so the technical view
 * survives ↑ / ↓; closing unmounts it, which resets it to the summary.
 */
export function ActivityDetailDrawer({ line, onClose }: ActivityDetailDrawerProps) {
  if (line === undefined) {
    return null;
  }
  return <ActivityDetailDrawerPanel line={line} onClose={onClose} />;
}
