import type { RunHistoryMasterListProps } from './run-history-panel.types';
import { RunHistoryRunRow } from './RunHistoryRunRow';

/**
 * Renders the scrollable master list of past runs under sticky day headers.
 * Scroll position drives the progressive-reveal `onScroll` trigger the panel
 * wires from `useRunHistoryPanel` — there is deliberately no "load more"
 * button (this rail is live, ADR-012).
 */
export function RunHistoryMasterList({ days, scrollRef, onScroll, onSelectRun }: Readonly<RunHistoryMasterListProps>) {
  return (
    <div
      className="max-h-[34rem] min-h-0 overflow-x-hidden overflow-y-auto pr-1 [scrollbar-width:thin]"
      data-testid="run-history-scroll"
      onScroll={onScroll}
      ref={scrollRef}
    >
      <ul aria-label="Runs" className="flex flex-col gap-0.5">
        {days.map((day, index) => (
          <li key={day.key}>
            <p className={`sticky top-0 z-[1] bg-surface px-2.5 pb-1 text-xs font-medium text-muted ${index === 0 ? '' : 'pt-3'}`}>{day.label}</p>
            <ul className="flex flex-col gap-0.5">
              {day.rows.map((row) => (
                <li key={row.runId}>
                  <RunHistoryRunRow row={row} onSelectRun={onSelectRun} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
