import type { Key } from '@heroui/react';
import type { ActivityChartBarModel, ActivityReadStatus } from '../../feed/activity-feed.types';
import type { ActivityChartScale } from '../../feed-source/feed.types';

/** Props of the time chart card. */
export interface ActivityTimeChartProps {
  /** Card heading, `Last 24 hours`. */
  readonly title: string;
  /** The selected scale. */
  readonly scale: ActivityChartScale;
  /** Applies the scale switch. */
  readonly onScaleChange: (keys: Set<Key>) => void;
  /** Request state of the overview. */
  readonly status: ActivityReadStatus;
  /** The bars, oldest first. */
  readonly bars: readonly ActivityChartBarModel[];
  /** Starts a drag on a bar. */
  readonly onBarPointerDown: (index: number) => void;
  /** Extends a drag over a bar. */
  readonly onBarPointerEnter: (index: number) => void;
  /** Ends a drag, selecting its bars. */
  readonly onBarsPointerUp: () => void;
  /** Cancels a drag that left the chart. */
  readonly onBarsPointerLeave: () => void;
  /** Reads the overview again after a failure. */
  readonly onRetry: () => void;
  /** Whether a pin is being written. */
  readonly isPinning: boolean;
  /** Pins this moment. */
  readonly onPin: () => void;
}
