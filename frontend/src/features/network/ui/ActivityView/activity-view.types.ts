/**
 * The tabs the Activity surface offers. The Overview is one of them and NOT a
 * route: it adds no entry to the application's route table and none to the
 * navigation rail, so it is reachable only from inside Activity.
 */
export type ActivityTabId = 'overview' | 'transactions' | 'runtime-events';

/**
 * Props for the ActivityView tab container. `initialTab` only chooses which
 * tab opens first; every tab stays reachable from the strip regardless.
 */
export interface ActivityViewProps {
  readonly initialTab?: ActivityTabId;
}
