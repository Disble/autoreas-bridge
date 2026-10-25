import type { DrawerHeaderModel, DrawerSection, DrawerTransitionEnd } from '../../drawer/drawer.types';
import type { ActivityFeedLine } from '../../feed-source/feed.types';

/**
 * Props of the Activity detail drawer (activity-ui-design-v2.md, Detail drawer).
 * The feed screen owns which line is open and the ↑ / ↓ / Esc keys; the drawer
 * renders that line and reports a close request.
 */
export interface ActivityDetailDrawerProps {
  /** The open line; undefined keeps the drawer closed. */
  readonly line: ActivityFeedLine | undefined;
  /** Asks the screen to close the drawer (×, Esc inside the drawer, or a click outside it and the rows). */
  readonly onClose: () => void;
}

/** Props of the drawer panel. */
export interface ActivityDetailDrawerPanelProps {
  /** The open line. */
  readonly line: ActivityFeedLine;
  /** Whether it is open; closed, it slides out and turns hidden. */
  readonly open: boolean;
  /** Reads the panel's transition ends, so a closed drawer unmounts once it has slid out. */
  readonly onTransitionEnd: (event: DrawerTransitionEnd) => void;
  /** Asks the screen to close the drawer. */
  readonly onClose: () => void;
}

/** Props of the drawer header. */
export interface ActivityDrawerHeaderProps {
  /** The header model. */
  readonly header: DrawerHeaderModel;
  /** Whether the technical view is open. */
  readonly technical: boolean;
  /** Opens or closes the technical view. */
  readonly onToggleTechnical: () => void;
  /** Copies the open view for an AI. */
  readonly onCopy: () => void;
  /** Closes the drawer. */
  readonly onClose: () => void;
}

/** Props of the summary view. */
export interface ActivityDrawerSummaryProps {
  /** Its sections, top to bottom. */
  readonly sections: readonly DrawerSection[];
}

/** Props of one summary section. */
export interface ActivityDrawerSectionProps {
  /** The section. */
  readonly section: DrawerSection;
}

/** Props of the before-and-after block of a summary section. */
export interface ActivityDrawerBeforeAfterProps {
  /** The before-and-after section. */
  readonly section: Extract<DrawerSection, { readonly kind: 'before-after' }>;
}

/** Props of the stats block of a summary section. */
export interface ActivityDrawerStatsProps {
  /** The stats section. */
  readonly section: Extract<DrawerSection, { readonly kind: 'stats' }>;
}

/** Props of the facts block of a summary section. */
export interface ActivityDrawerFactsProps {
  /** The facts section. */
  readonly section: Extract<DrawerSection, { readonly kind: 'facts' }>;
}

/** Props of the cause block of a summary section. */
export interface ActivityDrawerCauseProps {
  /** The cause section. */
  readonly section: Extract<DrawerSection, { readonly kind: 'cause' }>;
}

/** Props of the list block of a summary section. */
export interface ActivityDrawerListProps {
  /** The list section. */
  readonly section: Extract<DrawerSection, { readonly kind: 'list' }>;
}
