import { useEffect, useMemo, useState } from "react";
import { bridgeRuntimeSource } from "../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers";
import type { BridgeRuntimeSource } from "../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types";
import { normalizeStoredCoverPath } from "../../../../shared/anime-cover/anime-cover.helpers";
import { useAnimeCover } from "../../../../shared/anime-cover/use-anime-cover";
import type { WatchHistoryEntry } from "../../../../shared/contracts/anime.types";
import { deriveHistoryInspectorAddedMs, deriveHistoryInspectorLastWatchedMs } from "./history-inspector.helpers";
import type { HistoryInspectorHookProps, HistoryInspectorSnapshot, HistoryInspectorState } from "./history-inspector.types";

/**
 * Drives the History inspector (design D8): fetches one anime's detail per
 * selection and derives the Added / Last watched dates. The snapshot is keyed
 * by `animeId` with an `active` flag per effect (the `useAnimeDetail`
 * pattern), so arrow-keying through rows renders only the last anime: a
 * response for a superseded `animeId` is dropped, and a snapshot keyed to
 * another `animeId` reads as still loading. No debounce: the reads are local.
 *
 * The cover resolves through the shared `useAnimeCover` (design D1), gated on
 * the keyed snapshot's stored path, so the binding is called only with a
 * stored cover path. The 3 most recent episodes come from one unscoped page
 * (`cycle: 0, limit: 3`) per `animeId`, dropped when superseded; the page is
 * supplementary, so a failure degrades to no rows while the inspector's own
 * detail-driven state stands.
 */
export function useHistoryInspector(
  props: HistoryInspectorHookProps,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryInspectorState {
  // 1. Refs

  // 2. State
  const [snapshot, setSnapshot] = useState<HistoryInspectorSnapshot | undefined>(undefined);
  const [recentEpisodes, setRecentEpisodes] = useState<readonly WatchHistoryEntry[]>([]);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const snapshotDetail = snapshot === undefined || snapshot.animeId !== props.animeId ? undefined : snapshot.detail;
  const hasStoredCover = snapshotDetail === undefined || snapshotDetail === null
    ? false
    : normalizeStoredCoverPath(snapshotDetail.cover) !== undefined;
  // useAnimeCover is itself request-sequenced by animeId/hasStoredCover
  // (design D1): without a keyed stored path the gate stays false and no
  // binding call is spent, so this runs unconditionally.
  const cover = useAnimeCover(props.animeId ?? "", hasStoredCover, source);
  const addedMs = useMemo(
    () => snapshotDetail === undefined || snapshotDetail === null ? undefined : deriveHistoryInspectorAddedMs(snapshotDetail),
    [snapshotDetail],
  );
  const lastWatchedMs = useMemo(
    () => snapshotDetail === undefined || snapshotDetail === null
      ? undefined
      : deriveHistoryInspectorLastWatchedMs(snapshotDetail, recentEpisodes),
    [snapshotDetail, recentEpisodes],
  );

  // 6. Callbacks (useCallback calling pure helpers)

  // 7. Effects
  useEffect(() => {
    if (props.animeId === undefined) {
      return;
    }

    const animeId = props.animeId;
    let active = true;

    void source
      .getAnimeDetail(animeId)
      .then((result) => {
        if (!active) {
          return;
        }

        setSnapshot({ animeId, detail: result });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setSnapshot({ animeId, detail: null });
      });

    return () => {
      active = false;
    };
  }, [props.animeId, source]);

  useEffect(() => {
    if (props.animeId === undefined) {
      return;
    }

    const animeId = props.animeId;
    let active = true;
    setRecentEpisodes([]);

    void Promise.resolve(source.getAnimeWatchHistoryPage?.({ animeId, cycle: 0, cursor: "", limit: 3 }))
      .then((page) => {
        if (!active) {
          return;
        }

        if (page !== undefined && page.status === "ok") {
          setRecentEpisodes(page.items);
        }
      })
      .catch(() => {
        // The 3-row page is supplementary: a failure degrades to no rows
        // while the inspector's own detail-driven state stands.
      });

    return () => {
      active = false;
    };
  }, [props.animeId, source]);

  if (props.animeId === undefined) {
    return { status: "prompt", detail: undefined, addedMs: undefined, lastWatchedMs: undefined, cover, recentEpisodes: [] };
  }

  if (snapshotDetail === undefined) {
    return { status: "loading", detail: undefined, addedMs: undefined, lastWatchedMs: undefined, cover, recentEpisodes };
  }

  if (snapshotDetail === null) {
    return { status: "error", detail: undefined, addedMs: undefined, lastWatchedMs: undefined, cover, recentEpisodes };
  }

  return { status: "content", detail: snapshotDetail, addedMs, lastWatchedMs, cover, recentEpisodes };
}
