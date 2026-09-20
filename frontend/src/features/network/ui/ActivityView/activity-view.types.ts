import type { ReactNode } from 'react';

/**
 * The tabs the Activity surface offers. The Overview is one of them and NOT a
 * route: it adds no entry to the application's route table and none to the
 * navigation rail, so it is reachable only from inside Activity.
 */
export type ActivityTabId = 'overview' | 'transactions' | 'runtime-events';

/**
 * Props for the ActivityView tab container. `initialTab` only chooses which
 * tab opens first; every tab stays reachable from the strip regardless.
 *
 * `statusStrip` is an opaque element the app layer composes (the bridge status
 * card): ActivityView never inspects it, it only forwards it to the Overview
 * tab, which renders it above its aggregation content. Absence is meaningful
 * and documented: it renders no strip, so the two tab routes
 * (`/activity/runtime-events` among them) keep working unchanged — they simply
 * show no strip. There is deliberately no route or navigation entry for the
 * strip; it exists only inside the Overview tab.
 */
export interface ActivityViewProps {
  readonly initialTab?: ActivityTabId;
  readonly statusStrip?: ReactNode;
}
