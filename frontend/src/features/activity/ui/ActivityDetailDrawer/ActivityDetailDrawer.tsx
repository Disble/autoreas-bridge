import { useDrawerPresence } from '../../drawer/use-drawer-presence';
import { ActivityDetailDrawerPanel } from './ActivityDetailDrawerPanel';
import type { ActivityDetailDrawerProps } from './activity-detail-drawer.types';

/**
 * The Activity detail drawer: renders nothing until a line opens. The panel
 * stays mounted while the screen switches lines, so the technical view
 * survives ↑ / ↓; after close it stays mounted until it has slid out, and each
 * opening is a new session that starts at the summary.
 */
export function ActivityDetailDrawer({ line, onClose }: ActivityDetailDrawerProps) {
  const presence = useDrawerPresence(line);

  if (presence.line === undefined) {
    return null;
  }
  return <ActivityDetailDrawerPanel key={presence.session} line={presence.line} onClose={onClose} onTransitionEnd={presence.onTransitionEnd} open={presence.open} />;
}
