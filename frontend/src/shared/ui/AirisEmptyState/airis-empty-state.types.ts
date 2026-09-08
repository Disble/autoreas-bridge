/** A feature-owned recovery action displayed by the Airis empty-state shell. */
export interface AirisEmptyStateAction {
  /** Accessible button label shown to the user. */
  readonly label: string;
  /** Invoked when the user presses the recovery action. */
  readonly onPress: () => void;
}

/** Presentation-only inputs for one surface-owned Airis empty state. */
export interface AirisEmptyStateProps {
  /** Vite-resolved source URL for the surface-specific artwork. */
  readonly imageSrc: string;
  /** Visible concise explanation of the resolved empty result. */
  readonly title: string;
  /** Supporting guidance that helps the user recover from the empty result. */
  readonly description: string;
  /** Optional feature-owned recovery action. */
  readonly action?: AirisEmptyStateAction;
}
