import { useEffect, useRef } from 'react';
import { setSeasonStoreState } from '../store/season-store/season-store.helpers';
import { toSeasonBannerMessage } from './season.helpers';
import type { SeasonBannerPolicy, SeasonBannerSource } from './season.types';

/**
 * Reports a season read's new outcomes on the shared season banner (the
 * store's `errorMessage`): a new failure shows its text, and a new success
 * clears the banner when the policy says so. Outcomes the query already had
 * when the hook mounted are not reported again.
 * @param query The read whose outcomes are reported.
 * @param policy How an outcome reaches the banner.
 */
export function useSeasonBannerSync(query: SeasonBannerSource, policy: SeasonBannerPolicy): void {
  // 1. Refs
  const reported = useRef({ dataUpdatedAt: query.dataUpdatedAt, errorUpdatedAt: query.errorUpdatedAt });

  // 5. Derived State
  const { dataUpdatedAt, errorUpdatedAt, error } = query;

  // 7. Effects
  useEffect(() => {
    if (errorUpdatedAt === reported.current.errorUpdatedAt) {
      return;
    }
    reported.current.errorUpdatedAt = errorUpdatedAt;
    setSeasonStoreState({ errorMessage: toSeasonBannerMessage(error, policy) });
  }, [errorUpdatedAt, error, policy]);

  useEffect(() => {
    if (dataUpdatedAt === reported.current.dataUpdatedAt) {
      return;
    }
    reported.current.dataUpdatedAt = dataUpdatedAt;
    if (policy.clearOnSuccess) {
      setSeasonStoreState({ errorMessage: undefined });
    }
  }, [dataUpdatedAt, policy]);
}
