import { normalizeStoredCoverPath } from "../../../../shared/anime-cover/anime-cover.helpers";
import { useAnimeCover } from "../../../../shared/anime-cover/use-anime-cover";
import type { AnimeSource } from "../../../../shared/contracts/anime-source.types";
import { BRIDGE_ANIME_SOURCE } from "../../../../shared/query/bridge-runtime/bridge-runtime.constants";
import { animeKeys } from "../../../../shared/query/query-keys/query-keys.constants";
import { useBridgeQuery } from "../../../../shared/query/use-bridge-query/use-bridge-query";
import { HISTORY_INSPECTOR_RECENT_PAGE } from "./history-inspector.constants";
import { toHistoryInspectorState, toInspectedData } from "./history-inspector.helpers";
import type { HistoryInspectorHookProps, HistoryInspectorState } from "./history-inspector.types";

/**
 * Drives the History inspector (design D8): reads one anime's detail per
 * selection through `useBridgeQuery` on the `anime` module and derives the
 * Added / Last watched dates. Each read is keyed by `animeId`, so arrow-keying
 * through rows renders only the last anime: the previous selection's answer
 * reads as still loading. No debounce: the reads are local.
 *
 * The cover resolves through the shared `useAnimeCover` (design D1), gated on
 * the selection's own stored path, so the binding is called only with a stored
 * cover path. The 3 most recent episodes come from one unscoped page
 * (`cycle: 0, limit: 3`) per `animeId`; the page is supplementary, so a
 * failure degrades to no rows while the inspector's own detail-driven state
 * stands.
 *
 * @param props The selected anime.
 * @param source The anime port the reads go through.
 * @returns The exclusive inspector state.
 */
export function useHistoryInspector(
  props: HistoryInspectorHookProps,
  source: AnimeSource = BRIDGE_ANIME_SOURCE,
): HistoryInspectorState {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations
  const { animeId } = props;
  const detail = useBridgeQuery({
    queryKey: animeKeys.key("detail", animeId),
    queryFn: () => source.getAnimeDetail(animeId ?? ""),
    module: "anime",
    enabled: animeId !== undefined,
  });
  const recent = useBridgeQuery({
    queryKey: animeKeys.key("anime-watch-history", { animeId, ...HISTORY_INSPECTOR_RECENT_PAGE }),
    queryFn: () => source.getAnimeWatchHistoryPage({ animeId: animeId ?? "", ...HISTORY_INSPECTOR_RECENT_PAGE }),
    module: "anime",
    enabled: animeId !== undefined,
  });

  // 5. Derived State (useMemo)
  const hasStoredCover = normalizeStoredCoverPath(toInspectedData(detail)?.cover) !== undefined;
  // useAnimeCover is itself keyed by animeId (design D1): without the
  // selection's own stored path the gate stays false and no binding call is
  // spent, so this runs unconditionally.
  const cover = useAnimeCover(animeId ?? "", hasStoredCover, source);
  const state = toHistoryInspectorState({ animeId, detail, recent, cover });

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects

  return state;
}
