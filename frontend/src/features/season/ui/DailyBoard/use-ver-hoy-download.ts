import { useCallback, useMemo, useState } from 'react';
import type { SeasonAnimeRow, SeasonSource } from '../../../../infrastructure/season-source/season-source.types';
import { pruneSelection, toggleSelection } from './daily-board.helpers';

/**
 * useVerHoyDownload owns the Ver hoy multi-select and its "Download now": only
 * the checked animes still in Ver hoy are downloaded, as one run started through
 * the season port's `downloadSeasonAnimes`. A started run clears the selection;
 * a refused one (a run already in flight) keeps it and reports why.
 *
 * @param source The season port the download is started through.
 * @param verHoyRows The live Ver hoy rows, so a drained anime drops out of the selection.
 */
export function useVerHoyDownload(source: SeasonSource, verHoyRows: readonly SeasonAnimeRow[]) {
  // 2. State
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [downloadError, setDownloadError] = useState<string | undefined>(undefined);

  // 5. Derived State (useMemo)
  const verHoySelected = useMemo(() => pruneSelection(checked, verHoyRows), [checked, verHoyRows]);

  // 6. Callbacks
  // Stryker disable ArrayDeclaration: this deps array is mutation-equivalent whether it is `[]` or a
  // fixed literal such as `["Stryker was here"]`: React compares dependency arrays element by element
  // with `Object.is`, and the callback closes over state setters only, so its identity stays stable
  // across rerenders under either one and no test can observe the difference.
  // Changing the selection retires a stale refusal, so it never outlives the run it reported.
  const toggleVerHoySelect = useCallback((animeId: string) => {
    setChecked((prev) => toggleSelection(prev, animeId));
    setDownloadError(undefined);
  }, []);
  // Stryker restore ArrayDeclaration
  const onDownloadSelected = useCallback(() => {
    if (verHoySelected.size === 0) {
      return;
    }
    void source.downloadSeasonAnimes([...verHoySelected]).then((status) => {
      if (status === 'ok') {
        setChecked(new Set());
        setDownloadError(undefined);
      } else {
        setDownloadError(status);
      }
    });
  }, [source, verHoySelected]);

  return { verHoySelected, toggleVerHoySelect, onDownloadSelected, downloadError };
}
