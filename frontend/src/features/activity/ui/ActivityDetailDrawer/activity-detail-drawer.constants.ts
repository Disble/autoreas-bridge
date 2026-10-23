/** Classes of the header's origin tile per tone: red is spent only on failures. */
export const ACTIVITY_DRAWER_TILE_CLASS = {
  failed: 'bg-danger-soft text-danger',
  slow: 'bg-warning-soft text-warning',
  neutral: 'bg-default text-muted',
} as const;
