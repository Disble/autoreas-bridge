import type { KeyboardScope } from '../../keyboard.types';

/**
 * Tailwind classes shared between the real binding row and its loading
 * skeleton, so the two heights cannot drift (`autoreas-theme` skill's
 * loading-state contract; mirrors `CATALOG_LIST_ROW_CLASS`).
 */
export const KEYMAP_ROW_CLASS =
  'rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.04]';

/** How many placeholder rows the loading skeleton renders (CLAUDE.md frontend #14). */
export const KEYMAP_SKELETON_ROW_COUNT = 6;

/** Announced by the panel's status region while the persisted keymap has not yet resolved (design D11). */
export const KEYMAP_PANEL_LOADING_LABEL = 'Loading keyboard shortcuts...';

/** Shown by the panel's error `Alert` on a failed load or a failed save (spec "...Mandatory Loading And Error States"). */
export const KEYMAP_PANEL_ERROR_MESSAGE = 'Could not load or save your keyboard shortcuts.';

/**
 * The scope note rendered on a `KeymapBindingRow` for a scoped binding, or
 * `null` for a global command (design D10 -- a row is annotated with its
 * scope, e.g. "while the Notification Center is open"). A `Record` keyed by
 * every `KeyboardScope` member, not a lookup with a fallback default, so a
 * future scope added without a note here is a compile-time error rather
 * than a silently blank row.
 */
export const KEYMAP_SCOPE_NOTE_BY_SCOPE: Readonly<Record<KeyboardScope, string | null>> = {
  global: null,
  'notification-center': 'while the Notification Center is open',
};
