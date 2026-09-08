/**
 * Props for the shared uniform-bar loading placeholder. It owns the
 * `role="status"` region internally, so any adopting surface announces its
 * loading state simply by rendering this component — it cannot render bars
 * silently.
 */
export interface LoadingBarsProps {
  /** Number of placeholder bars to render. */
  readonly count: number;
  /** Accessible name for the status region, stating what is loading. */
  readonly label: string;
  /** Classes applied to the wrapping status region. */
  readonly className?: string;
  /** Classes applied to every bar; defaults to `h-10 w-full rounded-lg`. */
  readonly barClassName?: string;
}
