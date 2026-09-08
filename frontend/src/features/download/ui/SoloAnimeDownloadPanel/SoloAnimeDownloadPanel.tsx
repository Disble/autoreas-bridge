import { Button } from '@heroui/react';
import type { SoloAnimeDownloadPanelProps } from './solo-anime-download-panel.types';
import { SoloAnimeDownloadFilterBar } from './SoloAnimeDownloadFilterBar';
import { SoloAnimeDownloadResultRail } from './SoloAnimeDownloadResultRail';
import { SoloAnimeDownloadSelectionAlert } from './SoloAnimeDownloadSelectionAlert';
import { SoloAnimeDownloadStatusBanner } from './SoloAnimeDownloadStatusBanner';
import { SoloAnimeDownloadTriggerFeedback } from './SoloAnimeDownloadTriggerFeedback';
import { useSoloAnimeDownloadPanel } from './use-solo-anime-download-panel';

/**
 * SoloAnimeDownloadPanel lets the user choose one anime and launch a catch-up
 * run for it. Each status-dependent disclosure (the top-level status banner,
 * the result rail, the selection alert, and the trigger feedback chip) is a
 * colocated sibling component so this file stays a flat composition.
 */
export function SoloAnimeDownloadPanel({ className }: Readonly<SoloAnimeDownloadPanelProps>) {
  const {
    status,
    query,
    filter,
    options,
    counts,
    emptyMessage,
    selected,
    errorMessage,
    canTrigger,
    listWindow,
    onRetry,
    onQueryChange,
    onFilterChange,
    onSelectAnime,
    onTriggerDownload,
  } = useSoloAnimeDownloadPanel();

  return (
    <section aria-label="Solo anime download" className={`flex flex-col gap-3 ${className ?? ''}`}>
      <SoloAnimeDownloadFilterBar
        counts={counts}
        filter={filter}
        onFilterChange={onFilterChange}
        onQueryChange={onQueryChange}
        query={query}
      />

      <SoloAnimeDownloadStatusBanner errorMessage={errorMessage} onRetry={onRetry} status={status} />

      <SoloAnimeDownloadResultRail
        emptyMessage={emptyMessage}
        listWindow={listWindow}
        onSelectAnime={onSelectAnime}
        options={options}
        selectedId={selected?.id}
        status={status}
      />

      <SoloAnimeDownloadSelectionAlert selected={selected} />

      <Button isDisabled={!canTrigger} variant="primary" onPress={() => void onTriggerDownload()}>
        {status === 'triggering' ? 'Starting anime download...' : 'Download missing episodes'}
      </Button>

      <SoloAnimeDownloadTriggerFeedback status={status} />
    </section>
  );
}
