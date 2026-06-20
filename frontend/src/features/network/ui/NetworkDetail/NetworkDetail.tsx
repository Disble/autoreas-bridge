import { Chip } from '@heroui/react';
import { NETWORK_DETAIL_EMPTY_MESSAGE } from '../NetworkPanel/network-panel.constants';
import {
  formatNetworkDuration,
  getNetworkRowName,
  getNetworkStatusLabel,
  getNetworkStatusTone,
  toHeroChipColor,
} from '../NetworkPanel/network-panel.helpers';
import type { NetworkDetailProps } from '../NetworkPanel/network-panel.types';

/** Dumb detail panel for the selected Network row. Renders an empty prompt when nothing is selected. */
export function NetworkDetail({ row }: Readonly<NetworkDetailProps>) {
  if (row === null) {
    return (
      <div className="rounded-xl border border-divider/60 bg-content1/30 p-4 text-center text-default-400">
        <span className="text-sm">{NETWORK_DETAIL_EMPTY_MESSAGE}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-divider/60 bg-content1/30 p-4">
      <header className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium text-foreground">{getNetworkRowName(row)}</span>
        <Chip color={toHeroChipColor(getNetworkStatusTone(row.status))} size="sm" variant="soft">
          <Chip.Label id={`network-detail-status-${row.correlationId}`}>{getNetworkStatusLabel(row.status)}</Chip.Label>
        </Chip>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <span className="block text-xs text-default-500">Method</span>
          <span className="block text-sm text-foreground">{row.method || '—'}</span>
        </div>
        <div>
          <span className="block text-xs text-default-500">Type</span>
          <span className="block text-sm text-foreground">{row.domain}</span>
        </div>
        <div>
          <span className="block text-xs text-default-500">Duration</span>
          <span className="block text-sm text-foreground">{formatNetworkDuration(row.durationMs)}</span>
        </div>
        <div>
          <span className="block text-xs text-default-500">Started</span>
          <span className="block text-sm text-foreground">{row.startedAt}</span>
        </div>
      </div>

      {row.events.length > 0 ? (
        <div className="mt-1">
          <span className="block text-xs text-default-500">Events ({row.events.length})</span>
          <ul className="mt-1 flex flex-col gap-1">
            {row.events.map((event) => (
              <li
                className="truncate text-xs text-default-400"
                key={`${event.timestamp}-${event.eventType ?? 'none'}-${event.message}`}
              >
                {event.timestamp} — {event.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
