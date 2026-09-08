import { Button, Chip } from '@heroui/react';
import type { RunHistoryMasterListProps } from './run-history-panel.types';

/**
 * Renders the scrollable master list of past runs. Scroll position drives
 * the progressive-reveal `onScroll` trigger the panel wires from
 * `useRunHistoryPanel` — there is deliberately no "load more" button (this
 * rail is live, ADR-012).
 */
export function RunHistoryMasterList({ rows, scrollRef, onScroll, onSelectRun }: Readonly<RunHistoryMasterListProps>) {
  return (
    <div
      className="max-h-[32rem] min-h-0 overflow-x-hidden overflow-y-auto pr-1"
      data-testid="run-history-scroll"
      onScroll={onScroll}
      ref={scrollRef}
    >
      <ul aria-label="Run history list" className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.runId}>
            <Button
              aria-pressed={row.isSelected}
              className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                row.isSelected ? 'border-accent bg-accent/10 text-foreground' : 'border-divider/60 bg-content1/60'
              }`}
              variant="outline"
              onPress={() => onSelectRun(row.runId)}
            >
              <span className="flex flex-col">
                <span className="font-medium text-foreground">{row.startedLabel}</span>
                <span className="text-xs text-muted">{row.trigger}</span>
              </span>
              <Chip color={row.statusLabel === 'ok' ? 'success' : 'default'} size="sm" variant="soft">
                <Chip.Label>{row.statusLabel}</Chip.Label>
              </Chip>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
