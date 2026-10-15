import type { IconifyIcon } from '@iconify/react';

/**
 * Presentation-only inputs for a master/detail pane before anything is
 * selected (docs/design/patterns/empty-states.md, "awaiting-selection").
 */
export interface AwaitingSelectionPaneProps {
  /** The surface's own glyph, shown in the circle where the selected item's cover or mark goes. */
  readonly icon: IconifyIcon;
  /** The prompt, in the slot the selected item's name will take. */
  readonly title: string;
  /** One line telling the user what to do. */
  readonly description: string;
  /** The real field labels of the filled pane, previewed dimmed with an empty value. */
  readonly fields?: readonly string[];
  /** The real label of the filled pane's next section, previewed dimmed. */
  readonly sectionLabel?: string;
  /** One muted line at the bottom of the pane naming what opens there. */
  readonly footer?: string;
}
