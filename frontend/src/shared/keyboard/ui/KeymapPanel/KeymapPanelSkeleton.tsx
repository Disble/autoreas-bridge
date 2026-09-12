import { Skeleton } from '@heroui/react';
import { KEYMAP_PANEL_LOADING_LABEL, KEYMAP_ROW_CLASS, KEYMAP_SKELETON_ROW_COUNT } from './keymap-panel.constants';

/**
 * The keymap panel's loading placeholder: an announced live region holding a
 * stack of row-shaped placeholders that mirror `KeymapBindingRow`.
 *
 * It is its own component rather than markup inlined in `KeymapPanel`
 * because the promise a skeleton makes -- that content will not jump when it
 * arrives -- is a measurement, and the only thing that measures it is
 * `frontend/scripts/layout-fixtures/loading-skeletons-fixture.tsx`, which
 * renders a production skeleton beside the production row it stands in for
 * and compares what headless Edge actually laid out. That fixture imports a
 * component; it cannot import a branch. jsdom has no layout engine and will
 * pass a placeholder half the height of its row, so a unit test alone proves
 * nothing about the height.
 *
 * `aria-labelledby` is not optional here: `role="status"` takes its
 * accessible name from the author, so a region named only by its contents
 * computes `""`. The `sr-only` span has to exist anyway, because its text is
 * what a polite live region announces.
 */
export function KeymapPanelSkeleton() {
  return (
    <div aria-labelledby="keymap-panel-loading-label" aria-live="polite" className="flex flex-col gap-2" role="status">
      <span className="sr-only" id="keymap-panel-loading-label">
        {KEYMAP_PANEL_LOADING_LABEL}
      </span>
      {Array.from({ length: KEYMAP_SKELETON_ROW_COUNT }, (_unused, index) => (
        <div className={KEYMAP_ROW_CLASS} data-testid="keymap-panel-skeleton-row" key={index}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-4 w-2/5 rounded" />
            <Skeleton className="h-8 w-32 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
