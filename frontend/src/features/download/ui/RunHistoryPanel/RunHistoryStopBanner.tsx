import { Button } from '@heroui/react';
import type { RunHistoryStopBannerProps } from './run-history-panel.types';

/** Renders the "a run is in progress" strip with its Stop control, or nothing when no run is open. */
export function RunHistoryStopBanner({ runInProgress, isStopping, onCancel }: Readonly<RunHistoryStopBannerProps>) {
  if (!runInProgress) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-divider/60 px-3 py-2 sm:col-span-2">
      <span aria-live="polite" className="text-sm text-muted">
        {isStopping
          ? 'Stopping — the run ends after the episode it is already downloading.'
          : 'A download run is in progress.'}
      </span>
      <Button isDisabled={isStopping} isPending={isStopping} onPress={() => void onCancel()} size="sm" variant="secondary">
        {isStopping ? 'Stopping…' : 'Stop run'}
      </Button>
    </div>
  );
}
