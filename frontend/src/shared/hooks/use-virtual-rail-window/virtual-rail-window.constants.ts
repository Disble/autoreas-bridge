/**
 * Constants of the shared virtual rail window. They live beside the hook
 * rather than in any one rail because they parameterize the windowing
 * MECHANISM — the deterministic fallback viewport, the spacer math and the
 * overscan bands are the hook's own contract — and because two rails sharing
 * one copy is what keeps them from drifting into two different windowing
 * rules. The rows were measured on the Activity rails' real layout (see the
 * drift note below); a future rail with a genuinely different row height
 * passes its own `estimateSizePx` instead of editing these.
 */

/**
 * Constant estimated height of one rail row in px, the input the virtual
 * window's `estimateSize` runs on.
 *
 * The layout smoke measures a real rail row at 36-39 px, so 36 is the floor
 * of the band. The drift risk is recorded here on purpose instead of turning
 * on dynamic `measureElement`: with a constant estimate the spacer math is
 * exact by construction, while real rows up to 3 px taller make the scrollbar
 * under-report by at most ~0.1% per row inside the window band (spacers are
 * computed from the same estimate, so total scroll height stays exact for the
 * ESTIMATED layout; only real content position can drift a few px inside the
 * mounted window). Revisit dynamic measurement only if a real engine shows
 * visible scroll drift.
 */
export const VIRTUAL_RAIL_ROW_HEIGHT_ESTIMATE_PX = 36;

/** Rows the virtual window renders beyond each visible edge. */
export const VIRTUAL_RAIL_OVERSCAN_ROWS = 5;

/**
 * Viewport the virtual window assumes before a real measurement arrives.
 *
 * A measured 0x0 rect would produce an EMPTY virtual window (the range math
 * treats a zero viewport as "nothing visible"), which is what a bare jsdom
 * element measures. The hook maps a zero measurement to this viewport, so
 * tests run against a deterministic 1024x600 rail (the same figure the
 * virtualization spike used) and a real engine only ever sees it between
 * mount and its first rect observation, which ResizeObserver resolves in the
 * same frame.
 */
export const VIRTUAL_RAIL_INITIAL_VIEWPORT_PX = { width: 1_024, height: 600 };
