import { useEffect, useMemo, useState } from "react";
import { bridgeRuntimeSource } from "../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers";
import type { BridgeRuntimeSource } from "../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types";
import { deriveHistoryInspectorAddedMs, deriveHistoryInspectorLastWatchedMs } from "./history-inspector.helpers";
import type { HistoryInspectorHookProps, HistoryInspectorSnapshot, HistoryInspectorState } from "./history-inspector.types";

/**
 * Drives the History inspector (design D8): fetches one anime's detail per
 * selection and derives the Added / Last watched dates. The snapshot is keyed
 * by `animeId` with an `active` flag per effect (the `useAnimeDetail`
 * pattern), so arrow-keying through rows renders only the last anime: a
 * response for a superseded `animeId` is dropped, and a snapshot keyed to
 * another `animeId` reads as still loading. No debounce: the reads are local.
 */
export function useHistoryInspector(
  props: HistoryInspectorHookProps,
  source: BridgeRuntimeSource = bridgeRuntimeSource,
): HistoryInspectorState {
  // 1. Refs

  // 2. State
  const [snapshot, setSnapshot] = useState<HistoryInspectorSnapshot | undefined>(undefined);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const snapshotDetail = snapshot === undefined || snapshot.animeId !== props.animeId ? undefined : snapshot.detail;
  const recentRows = useMemo(() => props.recentRows ?? [], [props.recentRows]);
  const addedMs = useMemo(
    () => snapshotDetail === undefined || snapshotDetail === null ? undefined : deriveHistoryInspectorAddedMs(snapshotDetail),
    [snapshotDetail],
  );
  const lastWatchedMs = useMemo(
    () => snapshotDetail === undefined || snapshotDetail === null
      ? undefined
      : deriveHistoryInspectorLastWatchedMs(snapshotDetail, recentRows),
    [snapshotDetail, recentRows],
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

  if (props.animeId === undefined) {
    return { status: "prompt", detail: undefined, addedMs: undefined, lastWatchedMs: undefined };
  }

  if (snapshotDetail === undefined) {
    return { status: "loading", detail: undefined, addedMs: undefined, lastWatchedMs: undefined };
  }

  if (snapshotDetail === null) {
    return { status: "error", detail: undefined, addedMs: undefined, lastWatchedMs: undefined };
  }

  return { status: "content", detail: snapshotDetail, addedMs, lastWatchedMs };
}
