import { Alert, Button, Chip, ScrollShadow, SearchField, Spinner, Typography } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_EMPTY_SELECTION, SOLO_ANIME_DOWNLOAD_READY_LABEL } from './solo-anime-download-panel.constants';
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
		onRetry,
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

		<ScrollShadow className="flex max-h-56 flex-col gap-2 pr-1" aria-label="Anime results">
	        {options.map((option) => (
          <Button
            key={option.id}
            className="justify-between"
            variant={selected?.id === option.id ? 'primary' : 'secondary'}
            onPress={() => onSelectAnime(option.id)}
          >
	            <span className="min-w-0 truncate text-left">{option.name}</span>
	            <span className="flex shrink-0 flex-wrap justify-end gap-2">
	              {option.ready ? (
	                <Chip color="success" size="sm" variant="soft">
	                  <Chip.Label>{SOLO_ANIME_DOWNLOAD_READY_LABEL}</Chip.Label>
	                </Chip>
              ) : option.reasonLabels.map((reasonLabel) => (
                <Chip key={reasonLabel} color="warning" size="sm" variant="soft">
                  <Chip.Label>{reasonLabel}</Chip.Label>
                </Chip>
              ))}
	            </span>
          </Button>
        ))}
		</ScrollShadow>

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
