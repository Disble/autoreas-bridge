/** A feature-owned recovery action displayed by the Airis empty-state shell. */
export interface AirisEmptyStateAction {
  /** Accessible button label shown to the user. */
  readonly label: string;
  /** Invoked when the user presses the recovery action. */
  readonly onPress: () => void;
}

/**
 * Why a surface is empty, which decides the artwork, the action's weight and
 * the tone (docs/design/patterns/empty-states.md):
 * - `first-run`: nothing exists here yet; the mascot and one primary action.
 * - `waiting-on-step`: an earlier step has not produced anything; a slightly
 *   smaller mascot and the action that opens that step.
 * - `filtered`: the user's search or filters hide every row; a neutral icon,
 *   never the mascot, and a secondary "clear" action.
 * - `caught-up`: empty means done; a success icon and usually no action.
 */
export type AirisEmptyStateKind = 'first-run' | 'waiting-on-step' | 'filtered' | 'caught-up';

/** The kinds that show the mascot. */
export type AirisMascotKind = Extract<AirisEmptyStateKind, 'first-run' | 'waiting-on-step'>;

/** The kinds that show an icon instead of the mascot. */
export type AirisIconKind = Exclude<AirisEmptyStateKind, AirisMascotKind>;

/**
 * Where the empty state sits: `card` (default) is its own card; `section` fills
 * a section inside a wider card on the secondary surface; `row` is one line
 * inside its host card and always shows an icon. The artwork size of `card`
 * and `section` follows the container's width, not this prop.
 */
type AirisEmptyStateSize = 'card' | 'section' | 'row';

/** Inputs every kind shares. */
interface AirisEmptyStateBaseProps {
  /** Visible concise explanation of the resolved empty result. */
  readonly title: string;
  /** Supporting guidance that helps the user recover from the empty result. */
  readonly description: string;
  /** Optional feature-owned recovery action. */
  readonly action?: AirisEmptyStateAction;
  /** Placement; `card` when omitted. */
  readonly size?: AirisEmptyStateSize;
}

/** A mascot kind: it needs its artwork (a `row` replaces it with an icon). */
interface AirisMascotEmptyStateProps extends AirisEmptyStateBaseProps {
  /** Reason for the empty result; `first-run` when omitted. */
  readonly kind?: AirisMascotKind;
  /** Vite-resolved source URL for the surface-specific artwork. */
  readonly imageSrc: string;
}

/** An icon kind: it never shows the mascot, so it takes no artwork. */
interface AirisIconEmptyStateProps extends AirisEmptyStateBaseProps {
  /** Reason for the empty result. */
  readonly kind: AirisIconKind;
  /** Icon kinds never render artwork. */
  readonly imageSrc?: never;
}

/** Presentation-only inputs for one surface-owned Airis empty state. */
export type AirisEmptyStateProps = AirisMascotEmptyStateProps | AirisIconEmptyStateProps;
