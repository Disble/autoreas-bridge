/** Classes of the header's origin tile per tone: red is spent only on failures. */
export const ACTIVITY_DRAWER_TILE_CLASS = {
  failed: 'bg-danger-soft text-danger',
  slow: 'bg-warning-soft text-warning',
  neutral: 'bg-default text-muted',
} as const;

/**
 * Motion of the drawer panel (S12 M2, mockup `.ax-dw`): it slides in and out
 * over .25s `cubic-bezier(.32,.72,0,1)`, enters from 100% through
 * `@starting-style`, widens with the same curve, and turns hidden only after it
 * has slid out. All off under reduced motion.
 */
export const ACTIVITY_DRAWER_MOTION_CLASS = {
  open: 'visible translate-x-0 starting:translate-x-full [transition:translate_.25s_cubic-bezier(.32,.72,0,1),width_.25s_cubic-bezier(.32,.72,0,1),visibility_0s] motion-reduce:[transition:none]',
  closed: 'invisible translate-x-full [transition:translate_.25s_cubic-bezier(.32,.72,0,1),visibility_0s_linear_.25s] motion-reduce:[transition:none]',
} as const;

/** The panel shadow of the mockup: a hairline inset and `-16px 0 40px -12px` to the left. */
export const ACTIVITY_DRAWER_SHADOW_CLASS = 'shadow-[inset_0_0_1px_0_#ffffff4d,-16px_0_40px_-12px_#000000b3]';

/** The drawer footer hint of the feed's ↑ / ↓ keys (design doc, Detail drawer; no registry entry carries it). */
export const ACTIVITY_DRAWER_KEYS_HINT = 'previous or next event';

/** The mockup's failure text tone (`.ax-list .bad`, `.ax-dw-sub.bad`): danger mixed 65% into the foreground. */
export const ACTIVITY_DRAWER_FAILED_TEXT_CLASS = 'text-[color-mix(in_oklab,var(--danger)_65%,var(--foreground))]';

/** A stored code box of the summary (`.ax-code`): the page background, 12px radius, 12px by 14px inset. */
export const ACTIVITY_DRAWER_CODE_CLASS = 'overflow-x-auto rounded-xl bg-background px-3.5 py-3 font-mono text-xs leading-[1.55] whitespace-pre-wrap';

/** The header's icon-only actions as the mockup's `.ax-ib.sm`: 28px and muted, the foreground on hover. */
export const ACTIVITY_DRAWER_ACTIONS_CLASS = 'flex shrink-0 items-center gap-0.5 [&_button]:size-7 [&_button]:min-w-7 [&_button]:text-muted [&_button:hover]:text-foreground';
