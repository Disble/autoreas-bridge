/**
 * The stable state and refresh action exposed by a runtime-backed list hook.
 */
export interface UseAsyncListResult<T> {
  readonly isLoading: boolean;
  readonly items: readonly T[];
  readonly reload: () => void;
}
