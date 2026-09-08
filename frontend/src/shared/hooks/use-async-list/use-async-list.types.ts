/**
 * The stable state and refresh action exposed by a runtime-backed list hook.
 */
export interface UseAsyncListResult<T> {
  readonly isLoading: boolean;
  readonly items: readonly T[];
  /**
   * The reason the most recent request failed, or `undefined` while the last
   * settled request succeeded. Additive: consumers that only read `items` keep
   * their existing degrade-to-empty behavior.
   */
  readonly error: Error | undefined;
  readonly reload: () => void;
}
