import type { QueryKey } from '@tanstack/react-query';

/**
 * One context's mapping: when the backend emits `event`, every query under each
 * key prefix in `queryKeys` is invalidated (usually `<context>Keys.all`).
 */
export interface InvalidationRule {
  readonly event: string;
  readonly queryKeys: readonly QueryKey[];
}

/** Every backend event name the bridge listens to, with the prefixes it invalidates. */
export type InvalidationRegistry = ReadonlyMap<string, readonly QueryKey[]>;

/**
 * Port for backend runtime events; the Wails adapter is
 * `createRuntimeEventSource` (`infrastructure/wails-bindings.helpers.ts`).
 */
export interface RuntimeEventSource {
  /** Calls `listener` on every `eventName` emission; returns the unsubscribe function. */
  readonly subscribe: (eventName: string, listener: () => void) => () => void;
}
