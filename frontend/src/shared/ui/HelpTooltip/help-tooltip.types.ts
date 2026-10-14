/** Props for the "(?)" help tooltip placed next to a label or a title. */
export interface HelpTooltipProps {
  /** Accessible name of the "(?)" button, naming what it explains (for example "About the folder"). */
  readonly label: string;
  /** The explanation the tooltip shows on hover or focus. */
  readonly message: string;
}
