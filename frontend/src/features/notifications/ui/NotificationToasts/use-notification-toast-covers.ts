import { useEffect, useRef, useState } from 'react';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { AppNotificationRow } from '../../../../shared/contracts/app-notification.types';

/**
 * The minimal cover-resolution port this hook depends on -- the same shape
 * `use-notification-detail-covers.ts` takes, so a test injects a fake without
 * touching the Wails-backed singleton.
 */
export interface NotificationToastCoverSource {
  readonly getAnimeCover?: (animeID: string) => Promise<{ readonly dataUrl?: string; readonly source: string }>;
}

/**
 * Resolves cover art for each `refType: 'anime'` row a toast is about, keyed
 * by ref id.
 *
 * It answers with data URLs rather than the detail pane's richer entry map on
 * purpose: a toast has no loading state to show. It appears, and whatever has
 * resolved by the time React paints is what it draws -- an id with no cover
 * yet simply falls to the placeholder, exactly as one whose cover does not
 * exist does. Modelling "loading" here would put a spinner inside something
 * that lives for four seconds.
 *
 * A row never carries embedded image bytes (notification-center spec), which
 * is why the art is fetched here and not sent on the wire.
 */
export function useNotificationToastCovers(
  rows: readonly AppNotificationRow[],
  coverSource: NotificationToastCoverSource | undefined = bridgeRuntimeSource,
): ReadonlyMap<string, string> {
  const source = coverSource ?? bridgeRuntimeSource;
  // 1. Refs
  const requestedIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [covers, setCovers] = useState<ReadonlyMap<string, string>>(new Map());

  // 7. Effects
  useEffect(() => {
    if (source.getAnimeCover === undefined) {
      return;
    }

    for (const row of rows) {
      if (row.refType !== 'anime' || row.refId === '' || requestedIdsRef.current.has(row.refId)) {
        continue;
      }
      requestedIdsRef.current.add(row.refId);

      void source
        .getAnimeCover(row.refId)
        .then((cover) => {
          if (cover.source !== 'cover' || cover.dataUrl === undefined) {
            return;
          }
          setCovers((previous) => new Map(previous).set(row.refId, cover.dataUrl as string));
        })
        .catch(() => {
          // A cover that will not resolve is a placeholder, which is what an
          // unrecorded id already renders as. There is nothing to report.
        });
    }
  }, [rows, source]);

  return covers;
}
