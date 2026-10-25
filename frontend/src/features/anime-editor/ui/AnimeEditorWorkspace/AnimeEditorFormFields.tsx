import folderIcon from '@iconify-icons/solar/folder-with-files-bold-duotone';
import galleryIcon from '@iconify-icons/solar/gallery-bold-duotone';
import { Button, Chip, Disclosure, Label, ListBox, Select } from '@heroui/react';
import { AnimeMetadataLookupModal } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/AnimeMetadataLookupModal';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import { PathPickerField } from '../../../../shared/ui/PathPickerField';
import { ANIME_EDITOR_COVER_TYPE_OPTIONS, ANIME_EDITOR_FOLDER_HELP, ANIME_EDITOR_KIND_OPTIONS, ANIME_EDITOR_STATUS_OPTIONS } from './anime-editor-workspace.constants';
import { getAnimeEditorEstadoColor } from './anime-editor-workspace.helpers';
import type { AnimeEditorFormPanelProps } from './anime-editor-workspace.types';

/** Renders the anime data card's editable fields: the frequent ones, then the collapsed metadata. */
export function AnimeEditorFormFields({ viewModel }: Readonly<AnimeEditorFormPanelProps>) {
  return (
    <>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <LabeledTextField label="Name" value={viewModel.draft.name} onChange={(value) => viewModel.onDraftChange('name', value)} />
        </div>
        <AnimeMetadataLookupModal
          name={viewModel.draft.name}
          source={viewModel.metadataLookupSource}
          triggerVariant="icon"
          onConfirm={viewModel.onMetadataApplied}
        />
      </div>
      {viewModel.appliedMetadata === undefined ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="tertiary" onPress={viewModel.onMetadataUndo}>
            Undo autofill
          </Button>
        </div>
      )}

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
        <LabeledTextField label="Watched episodes" min={0} type="number" value={viewModel.draft.progress} onChange={(value) => viewModel.onDraftChange('progress', value)} />
        <LabeledTextField description="Leave empty if the total is unknown." label="Total episodes" min={0} placeholder="Unknown" type="number" value={viewModel.draft.totalEpisodes} onChange={(value) => viewModel.onDraftChange('totalEpisodes', value)} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <LabeledTextField description="Public URL where new episodes are published." label="Download page" placeholder="https://..." value={viewModel.draft.page} onChange={(value) => viewModel.onDraftChange('page', value)} />
        <PathPickerField
          browseIcon={folderIcon}
          browseLabel="Choose folder"
          description="Pick a folder from your system, or type the path directly."
          label="Folder"
          labelHelp={ANIME_EDITOR_FOLDER_HELP}
          mono
          placeholder="D:\\Anime\\..."
          value={viewModel.draft.folder}
          onBrowse={() => void viewModel.onPickFolder()}
          onChange={(value) => viewModel.onDraftChange('folder', value)}
        />
      </div>

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
                  browseIcon={galleryIcon}
                  browseLabel="Choose cover image"
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
    </>
  );
}
