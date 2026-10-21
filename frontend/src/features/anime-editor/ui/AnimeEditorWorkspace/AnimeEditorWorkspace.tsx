import { Alert, Chip } from '@heroui/react';
import type { AnimeEditorWorkspaceProps } from './anime-editor-workspace.types';
import { AnimeScheduleCard } from '../AnimeScheduleCard/AnimeScheduleCard';
import { EpisodeDurationsSection } from '../EpisodeDurationsSection/EpisodeDurationsSection';
import { AnimeEditorDialogs } from './AnimeEditorDialogs';
import { AnimeEditorFormPanel } from './AnimeEditorFormPanel';
import { AnimeEditorListPanel } from './AnimeEditorListPanel';
import { useAnimeEditorWorkspace } from './use-anime-editor-workspace';

/**
 * Renders the split-pane editor shell: the anime list on the left and three
 * independent cards on the right -- anime data, Episodes and Schedule (S15, S16).
 */
export function AnimeEditorWorkspace(props: Readonly<AnimeEditorWorkspaceProps>) {
  const viewModel = useAnimeEditorWorkspace(props);
  return (
    <section className="flex min-h-screen flex-col gap-4">
      {viewModel.isDirty && <Chip className="self-end" color="warning" size="sm" variant="soft">Unsaved changes</Chip>}
      {viewModel.feedback !== undefined && <Alert status="default"><Alert.Indicator /><Alert.Content><Alert.Description>{viewModel.feedback}</Alert.Description></Alert.Content></Alert>}
      {viewModel.validationMessage !== undefined && viewModel.validationMessage !== viewModel.feedback && <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Description>{viewModel.validationMessage}</Alert.Description></Alert.Content></Alert>}
      <div className="grid gap-4 xl:grid-cols-3 xl:items-start">
        <AnimeEditorListPanel viewModel={viewModel.listPanel} />
        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          <AnimeEditorFormPanel viewModel={viewModel.formPanel} />
          <EpisodeDurationsSection viewModel={viewModel.episodes} />
          <AnimeScheduleCard week={viewModel.scheduleWeek} onOpenSchedule={() => void viewModel.onOpenSchedule()} />
        </div>
      </div>
      <AnimeEditorDialogs scheduleTestDriverRef={props.scheduleTestDriverRef} viewModel={viewModel} />
    </section>
  );
}
