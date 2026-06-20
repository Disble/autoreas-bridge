import { Chip } from '@heroui/react';
import { toHeroChipColor } from '../NetworkPanel/network-panel.helpers';
import { NETWORK_EMPTY_STATE_MESSAGE } from '../NetworkPanel/network-panel.constants';
import type { NetworkTableProps } from '../NetworkPanel/network-panel.types';

/** Dumb table rendering the filtered Network rows. Selection is driven entirely by props. */
export function NetworkTable({ rows, selectedId, onSelect }: Readonly<NetworkTableProps>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-divider/60 bg-content1/30 py-10 text-center text-default-400">
        <span className="text-sm">{NETWORK_EMPTY_STATE_MESSAGE}</span>
      </div>
    );
  }

  return (
    <table aria-label="Network requests" className="w-full overflow-hidden rounded-xl border border-divider/60">
      <thead>
        <tr className="border-b border-divider/60 bg-content1/40 text-xs font-medium text-muted">
          <th className="px-3 py-2 text-left" scope="col">
            Name
          </th>
          <th className="px-3 py-2 text-left" scope="col">
            Status
          </th>
          <th className="px-3 py-2 text-left" scope="col">
            Type
          </th>
          <th className="px-3 py-2 text-left" scope="col">
            Duration
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            aria-selected={row.id === selectedId}
            className={`cursor-pointer border-b border-divider/40 text-sm transition-colors last:border-b-0 hover:bg-white/[0.03] ${
              row.id === selectedId ? 'bg-primary/10' : ''
            }`}
            key={row.id}
            onClick={() => onSelect(row.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(row.id);
              }
            }}
            tabIndex={0}
          >
            <td className="truncate px-3 py-2 font-mono text-xs text-foreground">
              <span className="mr-2 text-default-500">{row.method}</span>
              {row.name}
            </td>
            <td className="px-3 py-2">
              <Chip color={toHeroChipColor(row.statusTone)} size="sm" variant="soft">
                <Chip.Label id={`network-status-${row.id}`}>{row.statusLabel}</Chip.Label>
              </Chip>
            </td>
            <td className="px-3 py-2 text-xs text-default-500">{row.type}</td>
            <td className="px-3 py-2 font-mono text-xs text-default-500">{row.durationLabel}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
