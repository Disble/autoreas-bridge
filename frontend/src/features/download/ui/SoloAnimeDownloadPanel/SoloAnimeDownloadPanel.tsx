import { Button, Chip, SearchField, Spinner } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION } from './solo-anime-download-panel.constants';
import type { SoloAnimeDownloadPanelProps } from './solo-anime-download-panel.types';
import { useSoloAnimeDownloadPanel } from './use-solo-anime-download-panel';

/** SoloAnimeDownloadPanel lets the user choose one anime and launch a catch-up run for it. */
export function SoloAnimeDownloadPanel({ className }: Readonly<SoloAnimeDownloadPanelProps>) {
  const {
    status,
    query,
    options,
    selected,
    errorMessage,
    canTrigger,
    onQueryChange,
    onSelectAnime,
    onTriggerDownload,
  } = useSoloAnimeDownloadPanel();

  return (
    <section aria-label="Solo anime download" className={`flex flex-col gap-3 ${className ?? ''}`}>
      <SearchField aria-label="Search animes for solo download" fullWidth onChange={onQueryChange} value={query} variant="secondary">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search an anime..." />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      {status === 'loading' ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner size="sm" />
          <span>Loading animes...</span>
        </div>
      ) : null}

      <div className="flex max-h-56 flex-col gap-2 overflow-y-auto pr-1" aria-label="Anime results">
        {options.map((option) => (
          <Button
            key={option.id}
            className="justify-between"
            variant={selected?.id === option.id ? 'primary' : 'secondary'}
            onPress={() => onSelectAnime(option.id)}
          >
            <span className="min-w-0 truncate text-left">{option.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-xs opacity-80">{option.progressLabel}</span>
              {option.gapLabel !== undefined ? (
                <Chip color="warning" size="sm" variant="soft">
                  <Chip.Label>{option.gapLabel}</Chip.Label>
                </Chip>
              ) : null}
            </span>
          </Button>
        ))}
      </div>

      {selected === undefined ? <p className="text-sm text-muted">{SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION}</p> : null}
      {selected !== undefined && !selected.canDownload ? (
        <p className="text-sm text-warning">This anime needs a download page and folder before it can be downloaded.</p>
      ) : null}

      <Button isDisabled={!canTrigger} variant="primary" onPress={() => void onTriggerDownload()}>
        {status === 'triggering' ? 'Starting anime download...' : 'Download missing episodes'}
      </Button>

      {status === 'success' ? (
        <Chip color="success" size="sm" variant="soft">
          <Chip.Label>Anime download started.</Chip.Label>
        </Chip>
      ) : null}
      {status === 'already-in-progress' ? (
        <Chip color="default" size="sm" variant="soft">
          <Chip.Label>A download check is already in progress.</Chip.Label>
        </Chip>
      ) : null}
      {status === 'error' && errorMessage !== undefined ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
}
