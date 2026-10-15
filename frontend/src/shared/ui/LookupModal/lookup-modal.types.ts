import type { IconifyIcon } from '@iconify/react';
import type { ReactNode } from 'react';

/**
 * The lookup modal's one discriminant (design D8). Exactly one of these four
 * values is active at any time, so no reachable state renders two of the
 * modal's mutually exclusive list branches together.
 */
export type LookupModalState = 'idle' | 'loading' | 'resolved' | 'failed';

/**
 * Every user-facing string one lookup modal shows. Each lookup (MyAnimeList,
 * download providers) declares one constant of this shape, so the shared
 * shell carries no source-specific wording.
 */
export interface LookupModalCopy {
  /** The dialog's heading. */
  readonly heading: string;
  /** Accessible name of the search field. */
  readonly searchLabel: string;
  /** Placeholder of the search field. */
  readonly searchPlaceholder: string;
  /** Accessible name of the loading status region. */
  readonly loadingLabel: string;
  /** Heading of the alert shown when a search or a confirm fails. */
  readonly errorTitle: string;
  /** Builds the resolved-empty title from the current query. */
  readonly emptyTitle: (query: string) => string;
  /** Recovery guidance under the resolved-empty title. */
  readonly emptyDescription: string;
  /** Accessible name of the candidate list. */
  readonly listLabel: string;
  /** Label of the primary action that confirms the highlighted candidate. */
  readonly confirmLabel: string;
  /** Label of the action that closes the modal without applying anything. */
  readonly cancelLabel: string;
}

/** Presentation-only inputs for the shared lookup modal shell. */
export interface LookupModalProps {
  /** The lookup's own wording. */
  readonly copy: LookupModalCopy;
  /** The Button the HeroUI `Modal` treats as its trigger. */
  readonly trigger: ReactNode;
  /** Whether the dialog is open. */
  readonly isOpen: boolean;
  /** Invoked on every open-state change, Cancel included (with `false`). */
  readonly onOpenChange: (isOpen: boolean) => void;
  /** The search field's current value. */
  readonly query: string;
  /** Invoked with the search field's new value on every keystroke. */
  readonly onQueryChange: (query: string) => void;
  /** Which exclusive list state renders. */
  readonly state: LookupModalState;
  /** The search failure's message, shown in the failed state. */
  readonly errorMessage: string;
  /** Whether a resolved search returned rows; false renders the empty state. */
  readonly hasCandidates: boolean;
  /** The candidate rows, rendered only in the resolved, non-empty state. */
  readonly children: ReactNode;
  /** The last confirm failure's message; `''` hides its alert. */
  readonly confirmError: string;
  /** True while there is no highlighted candidate to confirm. */
  readonly isConfirmDisabled: boolean;
  /** True while the confirm action is in flight. */
  readonly isConfirming: boolean;
  /** Invoked when the primary action is pressed. */
  readonly onConfirm: () => void;
}

/** The subset of the shell's inputs its candidate area renders from. */
export type LookupModalResultsProps = Pick<
  LookupModalProps,
  'copy' | 'query' | 'state' | 'errorMessage' | 'hasCandidates' | 'children'
>;

/** Inputs for the danger alert of a failed search or confirm. */
export interface LookupErrorAlertProps {
  /** The alert's heading. */
  readonly title: string;
  /** The failure's own message. */
  readonly message: string;
}

/** Presentation-only inputs for one selectable candidate row. */
export interface LookupCandidateRowProps {
  /** The candidate's title, the row's first line. */
  readonly title: string;
  /** The muted second line; `''` renders no second line. */
  readonly subtitle: string;
  /** Cover URL; `undefined` renders the placeholder cover in the same slot. */
  readonly image?: string;
  /** Whether this is the row the user has currently highlighted. */
  readonly isSelected: boolean;
  /** Invoked when the row is pressed. */
  readonly onPress: () => void;
}

/**
 * How a lookup's trigger presents itself: the visible text button forms use,
 * or the round icon-only button a dense row action group uses.
 */
export type LookupTriggerVariant = 'text' | 'icon';

/** Props for the button that opens a lookup modal. */
export interface LookupTriggerProps {
  /** Visible text, accessible name and tooltip of the trigger. */
  readonly label: string;
  /** The icon the icon variant renders. */
  readonly icon: IconifyIcon;
  /** Which presentation to render; both open the same modal. */
  readonly variant: LookupTriggerVariant;
  /** True while there is nothing to search for. */
  readonly isDisabled: boolean;
}
