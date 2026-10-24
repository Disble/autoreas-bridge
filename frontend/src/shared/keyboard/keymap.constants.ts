import type { Chord, CommandBinding } from './keyboard.types';

/**
 * The only `KeymapDocument.version` this change ever produces or reads
 * (design D4). Lives here, not as a literal in `keymap.helpers.ts`, because
 * `dharness/role-file-shape` reserves `.helpers.ts` for types and functions.
 */
export const KEYMAP_DOCUMENT_VERSION = 1;

/**
 * Every scoped command's metadata, keyed by id so a lookup is a
 * compile-time checked property access rather than an `Array.find` that
 * could silently resolve to `undefined` for a renamed id (design D3).
 * `enabled`/`run` stay in the feature hook that owns the scope
 * (`use-notification-keyboard-scope.ts`, `use-activity-feed-keyboard-scope.ts`),
 * the only places with feature state to close over them.
 */
export const SCOPED_COMMAND_BINDINGS = {
  'notification-center.mark-all-read': {
    id: 'notification-center.mark-all-read',
    scope: 'notification-center',
    chord: 'alt+r',
    label: 'Mark all as read',
    section: 'Notifications',
  },
  'activity-feed.previous': {
    id: 'activity-feed.previous',
    scope: 'activity-feed',
    chord: 'arrowup',
    label: 'Open the newer Activity line',
    section: 'Activity',
  },
  'activity-feed.next': {
    id: 'activity-feed.next',
    scope: 'activity-feed',
    chord: 'arrowdown',
    label: 'Open the older Activity line',
    section: 'Activity',
  },
  'activity-feed.close': {
    id: 'activity-feed.close',
    scope: 'activity-feed',
    chord: 'escape',
    label: 'Close the Activity detail',
    section: 'Activity',
  },
} as const satisfies Readonly<Record<string, CommandBinding>>;

/**
 * The chords Chromium binds to page zoom, which WebView2 inherits (design
 * D9). Evidence-backed, so `findChordHazard` returns `'browser-zoom'` only
 * for an exact member of this set -- never a superset match, since holding
 * an extra modifier alongside one of these is not a chord anyone has
 * confirmed Chromium still intercepts.
 */
export const BROWSER_ZOOM_CHORDS: ReadonlySet<Chord> = new Set([
  'ctrl+0',
  'ctrl+numpad0',
  'ctrl++',
  'ctrl+=',
  'ctrl+-',
  'ctrl+numpadadd',
  'ctrl+numpadsubtract',
]);
