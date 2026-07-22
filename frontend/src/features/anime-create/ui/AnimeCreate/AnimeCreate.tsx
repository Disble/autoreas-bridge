import { Accordion, Alert, Button, Card, Typography } from '@heroui/react';
import { ANIME_TIPO_FILTER_ENTRIES } from '../../../../shared/constants/anime-tipo.constants';
import { LabeledSelect } from '../../../../shared/ui/LabeledSelect';
import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import { PathPickerField } from '../../../../shared/ui/PathPickerField';
import { AnimeScheduleOrdering } from '../../../anime-schedule-ordering/ui/AnimeScheduleOrdering';
import { useAnimeCreate } from './use-anime-create';

/**
 * Renders the batch anime-create workspace: one row per new anime plus an
 * embedded schedule board for day/order, and one deferred submit that
 * persists the whole batch. Pure presentation — every decision lives in the
 * colocated hook.
 */
export function AnimeCreate() {
  const viewModel = useAnimeCreate();

  return (
    <section className="flex min-h-screen flex-col gap-4">
      <header>
        <Typography type="h1">Create anime</Typography>
        <Typography color="muted" type="body-sm">Add one or more new animes, place each on the shared schedule board, then submit the whole batch at once.</Typography>
      </header>

      {viewModel.feedback !== undefined && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Create feedback</Alert.Title>
            <Alert.Description>{viewModel.feedback}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="flex flex-col gap-3">
        {viewModel.rows.map((row, index) => (
          <Card key={row.draftId}>
            <Card.Content className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-4">
                <LabeledTextField label={`Anime ${index + 1} name`} value={row.name} onChange={(value) => viewModel.onRowChange(row.draftId, { name: value })} />
                <LabeledTextField label="Page" value={row.page} onChange={(value) => viewModel.onRowChange(row.draftId, { page: value })} />
                <LabeledSelect
                  ariaLabel="Type"
                  fallbackValue={row.kind}
                  label="Type"
                  options={ANIME_TIPO_FILTER_ENTRIES}
                  placeholder="Select type"
                  value={row.kind}
                  variant="secondary"
                  onChange={(value) => viewModel.onRowChange(row.draftId, { kind: value })}
                />
                <PathPickerField
                  browseLabel="Browse…"
                  label="Folder"
                  value={row.folder}
                  onBrowse={() => viewModel.onBrowseFolder(row.draftId)}
                  onChange={(value) => viewModel.onRowChange(row.draftId, { folder: value })}
                />
              </div>
              <Accordion>
                <Accordion.Item id={`${row.draftId}-metadata`}>
                  <Accordion.Heading>
                    <Accordion.Trigger>Optional metadata</Accordion.Trigger>
                  </Accordion.Heading>
                  <Accordion.Panel>
                    <LabeledTextField
                      label="Premiere date (unix millis)"
                      placeholder="Leave empty if unknown"
                      value={row.premieredAt}
                      onChange={(value) => viewModel.onRowChange(row.draftId, { premieredAt: value })}
                    />
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
              <div className="flex justify-end">
                <Button isDisabled={!viewModel.canRemoveRow} variant="tertiary" onPress={() => viewModel.onRemoveRow(row.draftId)}>
                  Remove row
                </Button>
              </div>
            </Card.Content>
          </Card>
        ))}
        <Button className="self-start" variant="secondary" onPress={viewModel.onAddRow}>
          Add another anime
        </Button>
      </div>

      {viewModel.board !== undefined && (
        <AnimeScheduleOrdering
          board={viewModel.board}
          draftEntries={viewModel.draftEntries}
          isApplying={viewModel.isSubmitting}
          lockedAnimeIds={viewModel.lockedAnimeIds}
          onApplyCreateSubmit={viewModel.onApplyCreateSubmit}
        />
      )}
    </section>
  );
}
