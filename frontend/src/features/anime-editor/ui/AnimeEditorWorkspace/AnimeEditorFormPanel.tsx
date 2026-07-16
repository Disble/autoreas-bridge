import { Button, Card, Chip, Description, Disclosure, Input, Label, ListBox, Select, Skeleton, TextField, Typography } from '@heroui/react';
import { getAnimeEstadoLabel } from '../../../../shared/helpers/anime-estado.helpers';
import { ANIME_EDITOR_COVER_TYPE_OPTIONS, ANIME_EDITOR_STATUS_OPTIONS } from './anime-editor-workspace.constants';
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
          <TextField>
            <Label>Name</Label>
            <Input fullWidth value={viewModel.draft.name} variant="secondary" onChange={(event) => viewModel.onDraftChange('name', event.target.value)} />
          </TextField>

          <div className="grid gap-4 md:grid-cols-3">
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
            <TextField>
              <Label>Watched chapters</Label>
              <Input fullWidth min={0} type="number" value={viewModel.draft.progress} variant="secondary" onChange={(event) => viewModel.onDraftChange('progress', event.target.value)} />
            </TextField>
            <TextField>
              <Label>Total episodes</Label>
              <Input fullWidth min={0} placeholder="Unknown" type="number" value={viewModel.draft.totalEpisodes} variant="secondary" onChange={(event) => viewModel.onDraftChange('totalEpisodes', event.target.value)} />
              <Description>Leave empty if the total is unknown.</Description>
            </TextField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField>
              <Label>Download page</Label>
              <Input fullWidth placeholder="https://..." value={viewModel.draft.page} variant="secondary" onChange={(event) => viewModel.onDraftChange('page', event.target.value)} />
              <Description>Public URL where new episodes are published.</Description>
            </TextField>
            <TextField>
              <Label>Folder</Label>
              <div className="flex items-center gap-2">
                <Input className="font-mono" fullWidth placeholder="D:\\Anime\\..." value={viewModel.draft.folder} variant="secondary" onChange={(event) => viewModel.onDraftChange('folder', event.target.value)} />
                <Button className="shrink-0" variant="secondary" onPress={() => void viewModel.onPickFolder()}>Browse…</Button>
              </div>
              <Description>Pick a folder from your system, or type the path directly.</Description>
            </TextField>
          </div>

          <Button className="self-start" variant="secondary" onPress={() => void viewModel.onOpenSchedule()}>Open schedule editor</Button>

          <Disclosure isExpanded={viewModel.isDetailsOpen} onExpandedChange={viewModel.onToggleDetails}>
            <Disclosure.Heading>
              <Button className="w-full justify-between" slot="trigger" variant="secondary">
                More details
                <Disclosure.Indicator />
              </Button>
            </Disclosure.Heading>
            <Disclosure.Content>
              <Disclosure.Body className="grid gap-4 pt-4 md:grid-cols-2">
                <TextField><Label>Type</Label><Input fullWidth value={viewModel.draft.kind} variant="secondary" onChange={(event) => viewModel.onDraftChange('kind', event.target.value)} /></TextField>
                <TextField><Label>Duration</Label><Input fullWidth value={viewModel.draft.duration} variant="secondary" onChange={(event) => viewModel.onDraftChange('duration', event.target.value)} /></TextField>
                <TextField><Label>Origin</Label><Input fullWidth value={viewModel.draft.origin} variant="secondary" onChange={(event) => viewModel.onDraftChange('origin', event.target.value)} /></TextField>
                <TextField><Label>Premiere date</Label><Input fullWidth type="date" value={premieredMsToDateInput(viewModel.draft.premieredAt)} variant="secondary" onChange={(event) => viewModel.onDraftChange('premieredAt', premieredDateInputToMs(event.target.value))} /><Description>When the anime first aired.</Description></TextField>
                <div className="grid gap-4 md:col-span-2 md:grid-cols-[10rem_1fr]">
                  <Select aria-label="Cover source" value={viewModel.draft.coverType} variant="secondary" onChange={(value) => { if (value !== null) viewModel.onDraftChange('coverType', String(value)); }}>
                    <Label>Cover source</Label>
                    <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {ANIME_EDITOR_COVER_TYPE_OPTIONS.map((option) => (
                          <ListBox.Item id={option.value} key={option.value} textValue={option.label}>{option.label}<ListBox.ItemIndicator /></ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                  <TextField>
                    <Label>{viewModel.draft.coverType === 'image' ? 'Cover file path' : 'Cover image URL'}</Label>
                    <Input className={viewModel.draft.coverType === 'image' ? 'font-mono' : undefined} fullWidth placeholder={viewModel.draft.coverType === 'image' ? 'D:\\Anime\\...\\cover.jpg' : 'https://...'} value={viewModel.draft.coverPath} variant="secondary" onChange={(event) => viewModel.onDraftChange('coverPath', event.target.value)} />
                    <Description>{viewModel.draft.coverType === 'image' ? 'Local image file on disk.' : 'External cover image URL.'}</Description>
                  </TextField>
                </div>
                <TextField><Label>Genres</Label><Input fullWidth placeholder="Comma separated" value={viewModel.draft.genres} variant="secondary" onChange={(event) => viewModel.onDraftChange('genres', event.target.value)} /></TextField>
                <TextField><Label>Studios</Label><Input fullWidth placeholder="Comma separated" value={viewModel.draft.studios} variant="secondary" onChange={(event) => viewModel.onDraftChange('studios', event.target.value)} /></TextField>
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
