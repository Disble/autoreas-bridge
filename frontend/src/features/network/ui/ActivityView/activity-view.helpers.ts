/**
 * Derives the React Aria `selectedKeys` value for the Network table from the
 * current selection id. A cleared selection (`null`) must map to an empty key
 * set — never to a set holding the null id — because React Aria compares keys
 * against rendered rows and a `null` key would match nothing.
 *
 * This derivation lives here, beside the Transactions rail's constants, so the
 * Network events table and the upcoming Transactions table consume the same
 * single-source-of-truth helper instead of drifting into two divergent copies.
 *
 * The return value is a fresh array per call: React Aria treats the key set as
 * a controlled value, so callers must never share one mutable array instance
 * across renders.
 *
 * @param selectedId The id of the currently selected row, or `null` when the
 *   selection is cleared.
 * @returns A single-element array carrying the selected id, or an empty array
 *   when nothing is selected.
 */
export function selectionKeysFor(selectedId: string | null): readonly string[] {
  return selectedId === null ? [] : [selectedId];
}
