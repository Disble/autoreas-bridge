import { Link } from '@heroui/react';
import { useNavigate } from 'react-router';
import { NOTIFICATION_DETAIL_SHOW_ALL_LABEL, NOTIFICATION_DETAIL_SHOW_ALL_ROUTE } from './notification-detail.constants';

/**
 * The way out of a collapsed summary line (design-canvas `Main.dc.html`,
 * `Anatomy.dc.html`). The collapsed cohort is the part of a run the pane
 * deliberately refuses to enumerate — *"A notification that lists everything
 * is a log, and we already have one of those"* — so the line has to say where
 * the rest of it can actually be read, or the fold is just a dead end.
 *
 * Navigation lives in this component rather than in the collapsed row itself
 * so `useNavigate` is only ever called where a collapsed row is really
 * rendered: an ordinary row needs no router context to be testable, and one
 * that reached for it would drag a `MemoryRouter` into every row test that
 * has nothing to do with navigation.
 */
export function NotificationDetailShowAllLink() {
  const navigate = useNavigate();

  return (
    <Link
      onPress={() => {
        void navigate(NOTIFICATION_DETAIL_SHOW_ALL_ROUTE);
      }}
    >
      {NOTIFICATION_DETAIL_SHOW_ALL_LABEL}
    </Link>
  );
}
