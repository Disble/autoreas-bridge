import { useEffect, useRef, useState } from 'react';
import type { AnimeCoverSource } from '../../../../shared/anime-cover/anime-cover.types';
import type { NotificationDetailRow } from '../../../../shared/contracts/notification-center.types';
import { BRIDGE_ANIME_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import type { NotificationCoverEntry } from './notification-detail.types';

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
 *
 * Covers read through the `anime` module's port (`BRIDGE_ANIME_SOURCE`). A read
 * the module rejects (starting, failed) or that fails keeps the placeholder for
 * this mount: each id is asked once, and a missing cover is never a pane failure.
 * @param rows The detail rows whose anime covers are resolved.
 * @param coverSource The port `getAnimeCover` is called through; its absence (a
 * non-Wails context) resolves every anime row to the placeholder.
 * @returns The cover entry per anime ref id asked so far.
 */
export function useNotificationDetailCovers(
  rows: readonly NotificationDetailRow[],
  coverSource: AnimeCoverSource = BRIDGE_ANIME_SOURCE,
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
