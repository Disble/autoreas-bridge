import { Alert, Typography } from '@heroui/react';
import editorArtwork from '../../../../assets/airis-empty-states/editor-library.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { EPISODE_ADD_LABEL, EPISODE_DURATIONS_BODY_ID } from './episode-durations-section.constants';
import type { EpisodeDurationsSectionProps } from './episode-durations-section.types';
import { EpisodeDurationsTable } from './EpisodeDurationsTable';

/**
 * Renders the Episodes card's shown body: the folder banner, then exactly one of
 * loading (a skeleton table), failure (the surface Alert), empty (the inline
 * Airis state) or the table, then the notes.
 */
export function EpisodeDurationsBody({ viewModel }: Readonly<EpisodeDurationsSectionProps>) {
  return (
    <div className="flex min-w-0 flex-col gap-3" id={EPISODE_DURATIONS_BODY_ID}>
      {viewModel.banner === undefined ? null : (
        <Alert status={viewModel.banner.status}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{viewModel.banner.title}</Alert.Title>
            <Alert.Description>{viewModel.banner.description}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {viewModel.view === 'failed' ? (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Episode durations could not be loaded.</Alert.Title>
            <Alert.Description>{viewModel.failureMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {viewModel.emptyCopy === undefined ? null : (
        <AirisEmptyState
          action={viewModel.isEditingLocked ? undefined : { label: EPISODE_ADD_LABEL, onPress: viewModel.onOpenAdd }}
          description={viewModel.emptyCopy.description}
          imageSrc={editorArtwork}
          size="inline"
          title={viewModel.emptyCopy.title}
        />
      )}
      {viewModel.view === 'loading' || viewModel.view === 'table' ? <EpisodeDurationsTable viewModel={viewModel} /> : null}
      {viewModel.notes.map((note) => <Typography color="muted" key={note} type="body-xs">{note}</Typography>)}
    </div>
  );
}
