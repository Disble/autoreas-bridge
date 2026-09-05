import { Button, Card, Disclosure, Typography } from '@heroui/react';
import { ANIME_TIPO_FILTER_ENTRIES } from '../../../../shared/constants/anime-tipo.constants';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import { PathPickerField } from '../../../../shared/ui/PathPickerField';
import { ANIME_CREATE_COVER_TYPE_OPTIONS } from './anime-create.constants';
import { downloadPageDescription } from './anime-create.helpers';
import type { AnimeCreateRowProps } from './anime-create.types';

/** Renders one batch-create card: primary fields plus a collapsed optional-metadata section. */
export function AnimeCreateRow({ row, index, viewModel }: Readonly<AnimeCreateRowProps>) {
  const draftId = row.draftId;
  return (
    <Card>
      <Card.Content className="flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <Typography className="min-w-0" color="muted" truncate type="body-xs" weight="semibold">
            {row.name.trim() === '' ? `Anime ${index + 1}` : row.name}
          </Typography>
          <Button className="shrink-0 text-danger hover:text-danger" isDisabled={!viewModel.canRemoveRow} size="sm" variant="tertiary" onPress={() => viewModel.onRemoveRow(draftId)}>
            Remove
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledTextField
            errorMessage={viewModel.nameConflicts[draftId]}
            label="Name"
            placeholder="e.g. Shokugeki no Souma"
            value={row.name}
            onChange={(value) => viewModel.onRowChange(draftId, { name: value })}
          />
          <LabeledSelect
            ariaLabel="Type"
            fallbackValue={row.kind}
            label="Type"
            options={ANIME_TIPO_FILTER_ENTRIES}
            placeholder="Select type"
            value={row.kind}
            variant="secondary"
            onChange={(value) => viewModel.onRowChange(draftId, { kind: value })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <LabeledTextField
            description={downloadPageDescription(row.page)}
            label="Download page"
            placeholder="https://..."
            value={row.page}
            onChange={(value) => viewModel.onRowChange(draftId, { page: value })}
          />
          <PathPickerField
            browseLabel="Browse…"
            description="Where downloads are saved."
            label="Folder"
            mono
            placeholder="D:\\Anime\\..."
            value={row.folder}
            onBrowse={() => viewModel.onBrowseFolder(draftId)}
            onChange={(value) => viewModel.onRowChange(draftId, { folder: value })}
          />
        </div>

        <Disclosure>
          <Disclosure.Heading>
            <Button className="w-full justify-between" slot="trigger" variant="tertiary">
              Optional details
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledTextField label="Watched episodes" min={0} placeholder="0" type="number" value={row.episodesWatched} onChange={(value) => viewModel.onRowChange(draftId, { episodesWatched: value })} />
                <LabeledTextField description="Leave empty if unknown." label="Total episodes" min={0} placeholder="Unknown" type="number" value={row.totalEpisodes} onChange={(value) => viewModel.onRowChange(draftId, { totalEpisodes: value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledTextField label="Duration" min={1} placeholder="Minutes per episode" type="number" value={row.duration} onChange={(value) => viewModel.onRowChange(draftId, { duration: value })} />
                <LabeledTextField label="Origin" placeholder="e.g. Manga, Light novel" value={row.origin} onChange={(value) => viewModel.onRowChange(draftId, { origin: value })} />
              </div>
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <LabeledSelect
                  ariaLabel="Cover source"
                  fallbackValue={row.coverType}
                  label="Cover source"
                  options={ANIME_CREATE_COVER_TYPE_OPTIONS}
                  placeholder="Select cover source"
                  value={row.coverType}
                  variant="secondary"
                  onChange={(value) => viewModel.onRowChange(draftId, { coverType: value })}
                />
                {row.coverType === 'image' ? (
                  <PathPickerField
                    browseLabel="Browse…"
                    description="Local image file on disk."
                    label="Cover image path"
                    mono
                    placeholder="D:\\Anime\\...\\cover.jpg"
                    value={row.coverPath}
                    onBrowse={() => viewModel.onBrowseCover(draftId)}
                    onChange={(value) => viewModel.onRowChange(draftId, { coverPath: value })}
                  />
                ) : (
                  <LabeledTextField description="External cover image URL." label="Cover image URL" placeholder="https://..." value={row.coverPath} onChange={(value) => viewModel.onRowChange(draftId, { coverPath: value })} />
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <LabeledTextField label="Genres" placeholder="Comma separated" value={row.genres} onChange={(value) => viewModel.onRowChange(draftId, { genres: value })} />
                <LabeledTextField label="Studios" placeholder="Comma separated" value={row.studios} onChange={(value) => viewModel.onRowChange(draftId, { studios: value })} />
              </div>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </Card.Content>
    </Card>
  );
}
