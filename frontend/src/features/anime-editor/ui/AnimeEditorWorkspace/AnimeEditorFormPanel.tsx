import { Button, Card, Chip, Disclosure, Label, ListBox, Select, Skeleton, Typography } from '@heroui/react';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import { PathPickerField } from '../../../../shared/ui/PathPickerField';
import { ANIME_EDITOR_COVER_TYPE_OPTIONS, ANIME_EDITOR_KIND_OPTIONS, ANIME_EDITOR_STATUS_OPTIONS } from './anime-editor-workspace.constants';
import { getAnimeEditorEstadoColor, premieredDateInputToMs, premieredMsToDateInput } from './anime-editor-workspace.helpers';
import type { AnimeEditorFormPanelProps } from './anime-editor-workspace.types';

/** Renders frequent fields, collapsed metadata, and sticky lifecycle-safe actions. */
export function AnimeEditorFormPanel({ viewModel }: Readonly<AnimeEditorFormPanelProps>) {
  const record = viewModel.selectedRecord;
  return (
    <Card className="flex max-h-[calc(100dvh-7rem)] min-w-0 flex-col overflow-hidden xl:col-span-2"><Card.Content className="flex min-h-0 min-w-0 flex-col p-0">
      <header className="flex min-w-0 items-start justify-between gap-3 border-b border-divider px-5 py-4">
        <div className="min-w-0">
          <Typography truncate type="h4">{record?.frequent.name ?? 'Select an anime'}</Typography>
          <Typography color="muted" type="body-sm">{viewModel.isDirty ? 'You have unsaved changes.' : 'Selected anime stays highlighted after each refresh.'}</Typography>
        </div>
        {record !== undefined && (
          <Chip color={getAnimeEditorEstadoColor(viewModel.draft.status)} size="sm" variant="soft">
            <Chip.Label>{getAnimeEstadoLabel(viewModel.draft.status)}</Chip.Label>
          </Chip>
        )}
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-6 pt-5">
        {viewModel.isLoadingRecord && (
          <div className="flex flex-col gap-5" data-testid="anime-editor-form-skeleton">
            <div className="flex flex-col gap-2"><Skeleton className="h-3 w-16 rounded" /><Skeleton className="h-10 w-full rounded-lg" /></div>
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((slot) => <div className="flex flex-col gap-2" key={slot}><Skeleton className="h-3 w-24 rounded" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1].map((slot) => <div className="flex flex-col gap-2" key={slot}><Skeleton className="h-3 w-28 rounded" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}
            </div>
            <Skeleton className="h-9 w-44 rounded-lg" />
          </div>
        )}
        {!viewModel.isLoadingRecord && record === undefined && <Typography color="muted" type="body-sm">Pick an anime from the left to start editing.</Typography>}
        {!viewModel.isLoadingRecord && record !== undefined && <>
          <LabeledTextField label="Name" value={viewModel.draft.name} onChange={(value) => viewModel.onDraftChange('name', value)} />

          <div className="grid gap-4 md:grid-cols-2">
            <Select
              placeholder="Select status"
              value={String(viewModel.draft.status)}
              variant="secondary"
              onChange={(value) => { if (value !== null) viewModel.onDraftChange('status', String(value)); }}
            >
              <Label>Status</Label>
              <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {ANIME_EDITOR_STATUS_OPTIONS.map((option) => (
                    <ListBox.Item id={String(option.value)} key={option.value} textValue={option.label}>
                      <Chip color={getAnimeEditorEstadoColor(option.value)} size="sm" variant="soft"><Chip.Label>{option.label}</Chip.Label></Chip>
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <LabeledSelect
              ariaLabel="Type"
              fallbackValue={viewModel.draft.kind}
              label="Type"
              options={ANIME_EDITOR_KIND_OPTIONS}
              placeholder="Select type"
              variant="secondary"
              value={viewModel.draft.kind}
              onChange={(value) => viewModel.onDraftChange('kind', value)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledTextField label="Watched chapters" min={0} type="number" value={viewModel.draft.progress} onChange={(value) => viewModel.onDraftChange('progress', value)} />
            <LabeledTextField description="Leave empty if the total is unknown." label="Total episodes" min={0} placeholder="Unknown" type="number" value={viewModel.draft.totalEpisodes} onChange={(value) => viewModel.onDraftChange('totalEpisodes', value)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <LabeledTextField description="Public URL where new episodes are published." label="Download page" placeholder="https://..." value={viewModel.draft.page} onChange={(value) => viewModel.onDraftChange('page', value)} />
            <PathPickerField
              description="Pick a folder from your system, or type the path directly."
              label="Folder"
              mono
              placeholder="D:\\Anime\\..."
              value={viewModel.draft.folder}
              onBrowse={() => void viewModel.onPickFolder()}
              onChange={(value) => viewModel.onDraftChange('folder', value)}
            />
          </div>

          <Button className="self-start py-2" variant="secondary" onPress={() => void viewModel.onOpenSchedule()}>Open schedule editor</Button>

          <Disclosure isExpanded={viewModel.isDetailsOpen} onExpandedChange={viewModel.onToggleDetails}>
            <Disclosure.Heading>
              <Button className="w-full justify-between" slot="trigger" variant="secondary">
                More details
                <Disclosure.Indicator />
              </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="grid gap-4 pt-4 md:grid-cols-2">
                <LabeledTextField label="Duration" min={1} placeholder="Minutes per episode" type="number" value={viewModel.draft.duration} onChange={(value) => viewModel.onDraftChange('duration', value)} />
                <LabeledTextField label="Origin" placeholder="e.g. Manga, Light novel" value={viewModel.draft.origin} onChange={(value) => viewModel.onDraftChange('origin', value)} />
                <LabeledTextField description="When the anime first aired." label="Premiere date" type="date" value={premieredMsToDateInput(viewModel.draft.premieredAt)} onChange={(value) => viewModel.onDraftChange('premieredAt', premieredDateInputToMs(value))} />
                <div className="grid gap-4 md:col-span-2 md:grid-cols-[10rem_1fr]">
                  <LabeledSelect
                    ariaLabel="Cover source"
                    fallbackValue={viewModel.draft.coverType}
                    label="Cover source"
                    options={ANIME_EDITOR_COVER_TYPE_OPTIONS}
                    placeholder="Select cover source"
                    variant="secondary"
                    value={viewModel.draft.coverType}
                    onChange={(value) => viewModel.onDraftChange('coverType', value)}
                  />
                  {viewModel.draft.coverType === 'image' ? (
                    <PathPickerField
                      description="Local image file on disk."
                      label="Cover file path"
                      mono
                      placeholder="D:\\Anime\\...\\cover.jpg"
                      value={viewModel.draft.coverPath}
                      onBrowse={() => void viewModel.onPickCoverFile()}
                      onChange={(value) => viewModel.onDraftChange('coverPath', value)}
                    />
                  ) : (
                    <LabeledTextField description="External cover image URL." label="Cover image URL" placeholder="https://..." value={viewModel.draft.coverPath} onChange={(value) => viewModel.onDraftChange('coverPath', value)} />
                  )}
                </div>
                <LabeledTextField label="Genres" placeholder="Comma separated" value={viewModel.draft.genres} onChange={(value) => viewModel.onDraftChange('genres', value)} />
                <LabeledTextField label="Studios" placeholder="Comma separated" value={viewModel.draft.studios} onChange={(value) => viewModel.onDraftChange('studios', value)} />
              </Disclosure.Body>
            </Disclosure.Content>
          </Disclosure>
        </>}
      </div>

      <footer className="border-t border-divider bg-content1 px-5 py-3 shadow-[0_-8px_20px_-12px_rgba(0,0,0,0.6)]"><div className="flex flex-wrap items-center gap-3">
        <Button className="text-danger hover:text-danger" isDisabled={record === undefined || viewModel.isSaving} variant="tertiary" onPress={viewModel.onRequestDeactivate}>Deactivate anime</Button>
        <Button className="ml-auto" isDisabled={!viewModel.isDirty || viewModel.isSaving} variant="tertiary" onPress={viewModel.onDiscardChanges}>Discard changes</Button>
        <Button isDisabled={!viewModel.canSave || viewModel.isSaving} isPending={viewModel.isSaving} variant="primary" onPress={() => void viewModel.onSave()}>Save</Button>
      </div></footer>
    </Card.Content></Card>
  );
}
