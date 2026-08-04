import { Alert, Button, Chip, SearchField, Spinner, ToggleButton, ToggleButtonGroup, Typography, cn } from '@heroui/react';
import {
  SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION,
  SOLO_ANIME_DOWNLOAD_FILTER_OPTIONS,
} from './solo-anime-download-panel.constants';
import type { SoloAnimeDownloadPanelProps } from './solo-anime-download-panel.types';
import { useSoloAnimeDownloadPanel } from './use-solo-anime-download-panel';

/** SoloAnimeDownloadPanel lets the user choose one anime and launch a catch-up run for it. */
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
      <SearchField aria-label="Search animes for solo download" fullWidth onChange={onQueryChange} value={query} variant="secondary">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search an anime..." />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <ToggleButtonGroup
        aria-label="Download readiness filter"
        disallowEmptySelection
        fullWidth
        selectedKeys={[filter]}
        selectionMode="single"
        size="sm"
        onSelectionChange={(keys) => onFilterChange(String(Array.from(keys)[0] ?? filter))}
      >
        {SOLO_ANIME_DOWNLOAD_FILTER_OPTIONS.map((option) => (
          <ToggleButton id={option.id} key={option.id}>
            {option.label} · {option.id === 'ready' ? counts.ready : counts.blocked}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {status === 'loading' ? (
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <Typography color="muted" type="body-sm">Loading readiness...</Typography>
        </div>
      ) : null}

      {status === 'readiness-error' ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Download readiness unavailable</Alert.Title>
            <Alert.Description>{errorMessage ?? 'The readiness query failed.'}</Alert.Description>
            <Button className="mt-3" variant="secondary" onPress={onRetry}>Retry</Button>
          </Alert.Content>
        </Alert>
      ) : null}

      {status === 'trigger-error' ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Download could not start</Alert.Title>
            <Alert.Description>{errorMessage ?? 'The download could not start.'}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      {options.length === 0 && status !== 'loading' ? (
        <Typography color="muted" type="body-sm">{emptyMessage}</Typography>
      ) : null}

      {options.length > 0 ? (
        <div
          className="h-[22rem] min-h-0 overflow-x-hidden overflow-y-auto"
          data-testid="solo-anime-download-scroll"
          onScroll={listWindow.onScroll}
          ref={listWindow.scrollRef}
        >
          <div className="flex flex-col gap-0.5">
            {options.map((option) => (
              <Button
                className={cn(
                  'h-auto min-h-11 w-full min-w-0 justify-between gap-4 rounded-xl border-l-2 px-3 py-2 transition-colors',
                  selected?.id === option.id ? 'border-accent bg-accent/10' : 'border-transparent bg-transparent hover:bg-white/[0.04]',
                  option.ready ? '' : 'opacity-60',
                )}
                key={option.id}
                variant="tertiary"
                onPress={() => onSelectAnime(option.id)}
              >
                <Typography className="min-w-0 flex-1 whitespace-normal break-words text-left" type="body-sm" weight="semibold">
                  {option.name}
                </Typography>
                <span className="w-32 shrink-0 text-right">
                  {option.statusTag === undefined ? null : (
                    <Typography className="text-warning" truncate type="body-xs">{option.statusTag}</Typography>
                  )}
                </span>
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {selected === undefined ? <Typography color="muted" type="body-sm">{SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION}</Typography> : null}
      {selected !== undefined && !selected.ready ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{selected.name} cannot start a download check.</Alert.Title>
            <Alert.Description>{selected.reasonLabels.join(' ')}</Alert.Description>
          </Alert.Content>
        </Alert>
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
    </section>
  );
}
