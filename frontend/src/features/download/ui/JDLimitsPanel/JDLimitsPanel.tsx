import { Button, Skeleton } from '@heroui/react';
import { useJDLimitsPanel } from './use-jdlimits-panel';
import type { JDLimitsPanelProps } from './jdlimits-panel.types';

/**
 * JDLimitsPanel displays JDownloader's "Max. simultaneous Downloads" setting, the number
 * Bridge throttles itself to so it never queues more downloads than JDownloader will run.
 *
 * It is read-only: changing the setting requires the MyJDownloader `/config` API, which the
 * client does not implement yet. All I/O lives in the colocated `useJDLimitsPanel` hook;
 * this component is presentation-only.
 */
export function JDLimitsPanel({ className }: Readonly<JDLimitsPanelProps>) {
  const { status, maxSimultaneousDownloads, isAvailable, isRefreshing, errorMessage, refresh } = useJDLimitsPanel();

  if (status === 'loading') {
    return (
      <section aria-label="Loading JDownloader download limit" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className={`flex flex-col gap-3 ${className ?? ''}`}>
      {errorMessage !== undefined && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="flex items-baseline gap-2">
        <span className="text-sm text-muted">Max. simultaneous downloads</span>
        {isAvailable ? (
          <span className="text-2xl font-semibold tabular-nums">{maxSimultaneousDownloads}</span>
        ) : (
          <span className="text-sm text-muted">Unavailable</span>
        )}
      </div>

      <p className="text-sm text-muted">
        {isAvailable
          ? 'Bridge never starts more anime at once than this, so no download sits queued long enough to look dead.'
          : 'This setting could not be read from JDownloader, so Bridge does not limit how many anime it downloads at once.'}
      </p>

      <p className="text-sm text-muted">
        Change it in JDownloader under <strong>Settings → Max. simultaneous Downloads</strong>, then refresh here. It
        applies to your next run.
      </p>

      <div>
        <Button isDisabled={isRefreshing} variant="secondary" onPress={() => void refresh()}>
          {isRefreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
    </section>
  );
}
