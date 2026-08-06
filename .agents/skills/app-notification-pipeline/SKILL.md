---
name: app-notification-pipeline
description: "Global app notification pipeline using Chain of Responsibility. Use when adding a new notification source (backend push events, store-driven notices, etc.), modifying the toast controller, or debugging why a notification does not appear. Keywords: notification, toast, resolver, AppNotification, push, remove, pipeline, chain of responsibility, missed schedule, backend event."
metadata:
  author: autoreas-bridge
  version: "1.0.0"
  scope: project
  updates: living
---

# App Notification Pipeline

The frontend notification system uses **Chain of Responsibility** over a unified `AppNotification` contract. Every notification source is a resolver hook; one controller owns the HeroUI `ToastProvider` and renders all toasts through a single render path.

## Architecture

```
AppNotificationResolver (hooks, each receiving push/remove callbacks)
        ↑ push(n) / remove(id)
useAppNotificationController (single controller, owns toastIdsRef)
        ↓
renderAppNotificationToast (single renderer, maps severity→toast variant)
        ↓
HeroUI ToastProvider (one instance, mounted in NotificationToasts)
```

## When to reach for this

- Adding a toast with **actions** (buttons) — use `AppNotificationAction[]` with `onPress` callbacks.
- Adding a toast that must **persist** until explicitly dismissed — use `persistent: true`.
- Adding a toast that must **deduplicate** (one per concept) — use `persistedId`.
- Adding a **new notification source** (store state, backend event, polling result, WebSocket message).

## When NOT to use

- Ephemeral non-actionable backend push events already covered by the existing `useBackendEventResolver`.

## How to add a new notification source

1. Create a resolver hook under `frontend/src/features/notifications/ui/NotificationToasts/`:

```ts
import type { AppNotificationResolver } from '../../../../shared/contracts/app-notification.types';

export function useMyNotificationResolver: AppNotificationResolver = (push, remove) => {
  // 1. Read your data source (store, subscription, etc.)
  // 2. Call push({...}) when a notification should appear
  // 3. Call remove(id) when it should disappear
  // 4. All logic lives in useEffect; never hold isCurrent
};
```

2. Add it to the resolver array in `NotificationToasts.tsx`:

```tsx
const useResolvers = [
  useBackendEventResolver,
  useMissedScheduleResolver,
  useMyNotificationResolver, // ← one line
];
```

3. Write a colocated test verifying push/remove calls.

No other files change. The controller handles dedup, toast lifecycle, and rendering.

## Contract

### AppNotification

| Field | Type | Required | Description |
|---|---|---|---|
| `severity` | `'info' \| 'success' \| 'warning' \| 'danger'` | yes | Maps to HeroUI toast variant |
| `title` | `string` | yes | Toast heading |
| `description` | `string` | no | Toast body (supports JSX fragments) |
| `actions` | `AppNotificationAction[]` | no | Buttons rendered inline in the toast |
| `persistent` | `boolean` | no | If true, toast stays until explicitly removed |
| `persistedId` | `string` | no | If set, calls with the same id replace the existing toast |

### AppNotificationAction

| Field | Type | Required | Description |
|---|---|---|---|
| `children` | `string` | yes | Button label (HeroUI `actionProps.children`) |
| `onPress` | `() => void \| Promise<void>` | yes | Button action |
| `variant` | `'primary' \| 'secondary' \| 'danger' \| 'ghost' \| 'outline'` | no | Button variant (default: `'primary'` for first action, `'ghost'` for rest) |

### AppNotificationResolver

```ts
type AppNotificationResolver = (
  push: (notification: AppNotification) => void,
  remove: (persistedId: string) => void,
) => void;
```

A hook that receives stable `push` and `remove` callbacks. Called once at the top of the controller. Resolution logic lives inside the hook's effects.

## Files

| File | Role |
|---|---|
| `shared/contracts/app-notification.types.ts` | Unified `AppNotification`, `AppNotificationAction`, `AppNotificationSeverity`, `AppNotificationResolver` |
| `features/notifications/ui/NotificationToasts/app-notification.helpers.tsx` | `renderAppNotificationToast` — single render function |
| `features/notifications/ui/NotificationToasts/NotificationToasts.tsx` | Controller: wires resolvers into `ToastProvider` |
| `features/notifications/ui/NotificationToasts/use-backend-event-resolver.ts` | Resolver: `notification.push` events → ephemeral toasts |
| `features/notifications/ui/NotificationToasts/use-missed-schedule-resolver.ts` | Resolver: `useMissedScheduleNotice` store state → decision/failure toasts |
| `features/notifications/ui/NotificationToasts/notification-resolver.constants.ts` | Shared constants (LEVEL_TO_SEVERITY, toast IDs) |

## Constraints

- Resolvers are hooks and MUST be called at the top of the controller, satisfying the Rules of Hooks.
- `push` and `remove` are stable (`useCallback([], [])`) — resolvers do not re-subscribe.
- The controller is stateless (refs only). All dynamic behavior is driven by resolver effects.
- Ephemeral toasts auto-dismiss via HeroUI's `timeout`. Persistent toasts (`persistent: true`) set `timeout: 0` and stay until `remove()` is called.
