import { Alert, Button, Modal, Typography } from '@heroui/react';
import { AnimeScheduleOrdering } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/AnimeScheduleOrdering';
import { AnimeCreateRow } from './AnimeCreateRow';
import { useAnimeCreate } from './use-anime-create';

/**
 * Renders the batch anime-create workspace: variable-height title cards packed
 * masonry-lite across the full width, then a single action that opens the
 * create-scoped schedule board where each title is placed and the whole batch is
 * created at once. Pure presentation — every decision lives in the colocated hook.
 */
export function AnimeCreate() {
  const viewModel = useAnimeCreate();

  return (
    <section className="flex w-full flex-col gap-5">
      <header>
        <Typography type="h1">Create anime</Typography>
        <Typography color="muted" type="body-sm">Add one or more titles, then place each on the schedule to create the whole batch at once.</Typography>
      </header>

      {viewModel.feedback !== undefined && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content><Alert.Description>{viewModel.feedback}</Alert.Description></Alert.Content>
        </Alert>
      )}

      <div className="min-w-0 columns-1 gap-5 xl:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
        {viewModel.rows.map((row, index) => (
          <AnimeCreateRow index={index} key={row.draftId} row={row} viewModel={viewModel} />
        ))}
      </div>

      <Button className="self-start" variant="secondary" onPress={viewModel.onAddRow}>
        Add another anime
      </Button>

      <footer className="sticky bottom-0 flex items-center justify-between gap-4 border-t border-divider bg-content1/95 py-3 backdrop-blur">
        <Typography color="muted" type="body-sm">
          {viewModel.canOpenBoard
            ? 'Ready to place on the schedule.'
            : 'Give every title a name and a valid download page URL to continue.'}
        </Typography>
        <Button isDisabled={!viewModel.canOpenBoard || viewModel.isSubmitting} variant="primary" onPress={viewModel.onOpenBoard}>
          Place on schedule…
        </Button>
      </footer>

      <Modal isOpen={viewModel.isBoardOpen} onOpenChange={(isOpen) => { if (!isOpen) viewModel.onCloseBoard(); }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container>
            <Modal.Dialog className="h-dvh w-full max-w-none">
              <Modal.Body className="h-full p-4">
                {viewModel.board !== undefined && (
                  <AnimeScheduleOrdering
                    board={viewModel.board}
                    draftEntries={viewModel.draftEntries}
                    isApplying={viewModel.isSubmitting}
                    lockedAnimeIds={viewModel.lockedAnimeIds}
                    onApplyCreateSubmit={viewModel.onApplyCreateSubmit}
                    onClose={viewModel.onCloseBoard}
                  />
                )}
              </Modal.Body>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <Modal isOpen={viewModel.isRemoveConfirmOpen} onOpenChange={(isOpen) => { if (!isOpen) viewModel.onCancelRemove(); }}>
        <Modal.Backdrop variant="blur">
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.Header><Modal.Heading>Remove this anime?</Modal.Heading></Modal.Header>
              <Modal.Body><Typography type="body-sm">This row has data you entered. Removing it discards the row and its details.</Typography></Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={viewModel.onCancelRemove}>Cancel</Button>
                <Button className="text-danger hover:text-danger" variant="secondary" onPress={viewModel.onConfirmRemove}>Remove</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </section>
  );
}
