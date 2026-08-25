import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { notificationSource } from '../../../../infrastructure/notification-source/notification-source.helpers';
import type { NotificationSource } from '../../../../infrastructure/notification-source/notification-source.types';

/**
 * Subscribes to the backend `notification.navigate` event stream and moves the
 * application to the route each event carries.
 *
 * This is the delivery-layer half of the `navigation.open` intent. That intent
 * is the only registered one that runs no backend operation: pressing it emits
 * the route frozen into the action's args and nothing else, so the press is
 * only ever completed here. Until this hook existed the Go handler emitted
 * into the void and returned nil, which reported the press as a success while
 * the app stayed exactly where it was.
 *
 * The route is followed verbatim rather than matched against a known set —
 * `internal/download` already freezes both `/downloads` and `/editor/<id>`,
 * and a listener that recognised only the first would strand the second
 * silently, which is the same failure this hook exists to close.
 *
 * `source` is injectable, defaulting to the runtime-backed singleton, exactly
 * as `useBackendEventResolver` does.
 * @param source The runtime navigate stream to subscribe to.
 */
export function useNotificationNavigation(source: NotificationSource = notificationSource): void {
  // 3. Context / 3rd party hooks
  const navigate = useNavigate();

  // 1. Refs (declared after the hook whose value seeds them, so there is no
  // null initial state and therefore no unreachable null branch to defend)
  const navigateRef = useRef(navigate);

  // 7. Effects
  // Refreshed in an effect rather than during render, for the reason
  // `use-backend-event-resolver.ts` records: React may discard a render pass,
  // and a ref written during one that never commits leaves the subscription
  // below calling a stale callback. The subscription itself must stay keyed on
  // `source` alone, which is why the ref exists at all — re-subscribing on
  // every render would tear down and re-attach the runtime listener each time
  // the router re-renders, which is most of them.
  //
  // BOUNDARY: no test pins this refresh, and deleting it leaves the suite
  // green — confirmed by hand-mutation. `useNavigate`'s identity carries the
  // location it resolves RELATIVE routes against, and every route a producer
  // freezes today is absolute (`/downloads`, `/editor/<id>` in
  // `internal/download`), so a stale `navigate` is currently indistinguishable
  // from a fresh one. It is kept because that is a property of today's
  // producers rather than of this hook, and the day one freezes a relative
  // route the failure would be a silent navigation to the wrong screen.
  useEffect(() => {
    navigateRef.current = navigate;
  });

  useEffect(() => {
    return source.subscribeNavigate((route) => {
      void navigateRef.current(route);
    });
  }, [source]);
}
