import { getNetworkLevelAccentBorderClass, getNetworkLevelDotClass } from '../NetworkPanel/network-panel.helpers';
import { NETWORK_EMPTY_STATE_MESSAGE, NETWORK_LOADING_STATE_MESSAGE } from '../NetworkPanel/network-panel.constants';
import type { NetworkTableProps } from '../NetworkPanel/network-panel.types';

/** Dumb dense table rendering the filtered per-entry Network rows (DevTools-Network density). Selection is driven entirely by props. */
export function NetworkTable({ rows, selectedId, onSelect, isLoading, scrollRef, onScroll }: Readonly<NetworkTableProps>) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-divider/60 bg-content1/30 py-10 text-center text-default-400">
        <span className="text-sm">{NETWORK_LOADING_STATE_MESSAGE}</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-divider/60 bg-content1/30 py-10 text-center text-default-400">
        <span className="text-sm">{NETWORK_EMPTY_STATE_MESSAGE}</span>
      </div>
    );
  }

  return (
    <div className="max-h-[32rem] overflow-auto rounded-xl border border-divider/60 2xl:max-h-[40rem]" onScroll={onScroll} ref={scrollRef}>
      <table aria-label="Network log entries" className="w-full">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-divider/60 bg-content1/90 text-[11px] font-medium text-muted backdrop-blur-sm">
            <th className="px-2.5 py-1 text-left" scope="col">
              Time
            </th>
            <th className="px-2.5 py-1 text-left" scope="col">
              Domain
            </th>
            <th className="px-2.5 py-1 text-left" scope="col">
              Level
            </th>
            <th className="px-2.5 py-1 text-left" scope="col">
              Message
            </th>
            <th className="px-2.5 py-1 text-left" scope="col">
              Status
            </th>
            <th className="px-2.5 py-1 text-left" scope="col">
              Duration
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              aria-selected={row.id === selectedId}
              className={`cursor-pointer border-b border-l-2 border-divider/40 text-xs transition-colors last:border-b-0 hover:bg-white/[0.03] ${getNetworkLevelAccentBorderClass(
                row.level,
              )} ${row.id === selectedId ? 'bg-primary/10' : ''}`}
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
              <td className="whitespace-nowrap px-2.5 py-1 font-mono text-[11px] text-default-500">{row.timeLabel}</td>
              <td className="px-2.5 py-1">
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-default-400">{row.domain}</span>
              </td>
              <td className="px-2.5 py-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-default-400">
                  <span aria-hidden="true" className={`inline-block size-1.5 rounded-full ${getNetworkLevelDotClass(row.level)}`} />
                  {row.level}
                </span>
              </td>
              <td className="max-w-[28rem] truncate px-2.5 py-1 text-foreground" title={row.message}>
                {row.message}
              </td>
              <td className="whitespace-nowrap px-2.5 py-1 font-mono text-[11px] text-default-500">{row.statusLabel}</td>
              <td className="whitespace-nowrap px-2.5 py-1 font-mono text-[11px] text-default-500">{row.durationLabel}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
