import { useEffect, useRef, useState } from 'react';
import type { NotificationDetailRow } from '../../../../shared/contracts/notification-center.types';
import { bridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import type { NotificationCoverEntry } from './notification-detail.types';

/**
 * The minimal cover-resolution port this hook depends on -- matches
 * `bridgeRuntimeSource.getAnimeCover`'s shape exactly so a test can inject a
 * fake without touching the real Wails-backed singleton (mirrors
 * `EpisodeSchedulePanel`'s own injectable-source pattern).
 */
export interface NotificationDetailCoverSource {
  readonly getAnimeCover?: (animeID: string) => Promise<{ readonly dataUrl?: string; readonly source: string }>;
}

/**
 * Resolves cover art for each `refType: 'anime'` row via the existing
 * `getAnimeCover` binding, caching results for the component's lifetime
 * (design.md §9.2; notification-center spec, "A row never carries embedded
 * image bytes"). Mirrors `use-episode-schedule-panel.ts`'s cover cache
 * exactly -- not itself named by design.md's own module tree (only
 * `use-notification-action.ts` is), added here because CLAUDE.md frontend
 * constraint #1 bars a Wails call or a `useEffect` from living directly in
 * `NotificationDetailRows.tsx`; a colocated hook is the only place it can
 * live. Only `refType === 'anime'` rows resolve a cover -- `episode`/`link`
 * rows fall straight to the placeholder, since neither has its own cover
 * asset today.
 */
export function useNotificationDetailCovers(
  rows: readonly NotificationDetailRow[],
  coverSource: NotificationDetailCoverSource = bridgeRuntimeSource,
): ReadonlyMap<string, NotificationCoverEntry> {
  // 1. Refs
  const fetchedIdsRef = useRef<Set<string>>(new Set());

  // 2. State
  const [covers, setCovers] = useState<ReadonlyMap<string, NotificationCoverEntry>>(new Map());

  // 7. Effects
  useEffect(() => {
    const idsToFetch: string[] = [];
    for (const row of rows) {
      if (row.refType !== 'anime' || fetchedIdsRef.current.has(row.refId)) {
        continue;
      }
      idsToFetch.push(row.refId);
    }

    if (idsToFetch.length === 0) {
      return;
    }

    for (const id of idsToFetch) {
      fetchedIdsRef.current.add(id);
    }

    if (coverSource.getAnimeCover === undefined) {
      setCovers((previous) => addPlaceholders(previous, idsToFetch));
      return;
    }

    for (const id of idsToFetch) {
      void coverSource
        .getAnimeCover(id)
        .then((cover) => {
          setCovers((previous) => {
            const next = new Map(previous);
            next.set(id, cover.source === 'cover' && cover.dataUrl !== undefined ? { dataUrl: cover.dataUrl, status: 'cover' } : { status: 'placeholder' });
            return next;
          });
        })
        .catch(() => {
          setCovers((previous) => addPlaceholders(previous, [id]));
        });
    }
  }, [coverSource, rows]);

  return covers;
}

/** Marks every id in `ids` as resolved-to-placeholder inside `previous`, returning a fresh map. */
function addPlaceholders(previous: ReadonlyMap<string, NotificationCoverEntry>, ids: readonly string[]): ReadonlyMap<string, NotificationCoverEntry> {
  const next = new Map(previous);
  for (const id of ids) {
    next.set(id, { status: 'placeholder' });
  }
  return next;
}
