import { Chip, Typography } from '@heroui/react';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import { AnimeEditorHeaderCover } from './AnimeEditorHeaderCover';
import { getAnimeEditorEstadoColor } from './anime-editor-workspace.helpers';
import type { AnimeEditorFormPanelProps } from './anime-editor-workspace.types';

/** Renders the anime data card's header: the saved cover, the name, the dirty hint and the status chip. */
export function AnimeEditorFormHeader({ viewModel }: Readonly<AnimeEditorFormPanelProps>) {
  const record = viewModel.selectedRecord;
  return (
    <header className="flex min-w-0 items-start justify-between gap-3 border-b border-divider px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <AnimeEditorHeaderCover
          animeId={record?.animeId}
          cover={viewModel.cover}
          onCoverImageError={viewModel.onCoverImageError}
        />
        <div className="min-w-0">
          <Typography truncate type="h4">{record?.frequent.name ?? 'Select an anime'}</Typography>
          <Typography color="muted" type="body-sm">{viewModel.isRecordDirty ? 'You have unsaved changes.' : 'Selected anime stays highlighted after each refresh.'}</Typography>
        </div>
      </div>
      {record !== undefined && (
        <Chip color={getAnimeEditorEstadoColor(viewModel.draft.status)} size="sm" variant="soft">
          <Chip.Label>{getAnimeEstadoLabel(viewModel.draft.status)}</Chip.Label>
        </Chip>
      )}
    </header>
  );
}
