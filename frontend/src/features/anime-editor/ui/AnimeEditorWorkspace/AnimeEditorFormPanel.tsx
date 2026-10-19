import { Card, Typography } from '@heroui/react';
import { memo } from 'react';
import { AnimeEditorFormActions } from './AnimeEditorFormActions';
import { AnimeEditorFormFields } from './AnimeEditorFormFields';
import { AnimeEditorFormHeader } from './AnimeEditorFormHeader';
import { AnimeEditorFormSkeleton } from './AnimeEditorFormSkeleton';
import type { AnimeEditorFormPanelProps } from './anime-editor-workspace.types';

/**
 * Renders the anime data card: frequent fields, collapsed metadata, and sticky
 * lifecycle-safe actions. Its dirty state, Discard changes and Save cover the
 * anime fields only; the Episodes and Schedule cards stand on their own (S15).
 * Memoized on its `formPanel` slice, so a workspace step that changes nothing
 * it shows skips it.
 */
export const AnimeEditorFormPanel = memo(function AnimeEditorFormPanel({ viewModel }: Readonly<AnimeEditorFormPanelProps>) {
  const record = viewModel.selectedRecord;
  return (
    <Card className="flex max-h-[calc(100dvh-7rem)] min-w-0 flex-col overflow-hidden"><Card.Content className="flex min-h-0 min-w-0 flex-col p-0">
      <AnimeEditorFormHeader viewModel={viewModel} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-6 pt-5">
        {viewModel.isLoadingRecord && <AnimeEditorFormSkeleton />}
        {!viewModel.isLoadingRecord && record === undefined && <Typography color="muted" type="body-sm">Pick an anime from the left to start editing.</Typography>}
        {!viewModel.isLoadingRecord && record !== undefined && <AnimeEditorFormFields viewModel={viewModel} />}
      </div>
      <AnimeEditorFormActions viewModel={viewModel} />
    </Card.Content></Card>
  );
});
