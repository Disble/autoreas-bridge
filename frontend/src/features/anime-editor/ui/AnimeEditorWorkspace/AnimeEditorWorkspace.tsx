import { Alert, Chip, Typography } from '@heroui/react';
import type { AnimeEditorWorkspaceProps } from './anime-editor-workspace.types';
import { AnimeEditorDialogs } from './AnimeEditorDialogs';
import { AnimeEditorFormPanel } from './AnimeEditorFormPanel';
import { AnimeEditorListPanel } from './AnimeEditorListPanel';
import { useAnimeEditorWorkspace } from './use-anime-editor-workspace';

/** Renders the split-pane editor shell from its focused workspace view model. */
export function AnimeEditorWorkspace(props: Readonly<AnimeEditorWorkspaceProps>) {
  const viewModel = useAnimeEditorWorkspace(props);
  return (
    <section className="flex min-h-screen flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div><Typography type="h1">Anime Editor</Typography><Typography color="muted" type="body-sm">Edit anime metadata and schedule from one focused workspace.</Typography></div>
        {viewModel.isDirty && <Chip color="warning" size="sm" variant="soft">Unsaved changes</Chip>}
      </header>
      {viewModel.feedback !== undefined && <Alert status="default"><Alert.Indicator /><Alert.Content><Alert.Description>{viewModel.feedback}</Alert.Description></Alert.Content></Alert>}
      {viewModel.validationMessage !== undefined && viewModel.validationMessage !== viewModel.feedback && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{viewModel.validationMessage}</Alert.Description></Alert.Content></Alert>}
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <AnimeEditorListPanel viewModel={viewModel} />
        <AnimeEditorFormPanel viewModel={viewModel} />
      </div>
      <AnimeEditorDialogs viewModel={viewModel} />
    </section>
  );
}
