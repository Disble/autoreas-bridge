import { Button, Modal, Typography } from '@heroui/react';
import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import type { EpisodeDurationsDialogsProps } from './episode-durations-section.types';
import { EpisodeReanalysisReviewModal } from './EpisodeReanalysisReviewModal';

/**
 * Renders the Episodes section's modals: Edit episode (Minutes, who set the
 * value, Clear duration, Cancel, Apply), Add episode (a prefilled number and
 * Minutes, with the inline duplicate error and the long hint), and the
 * re-analysis review. Each writes to the Editor draft only.
 */
export function EpisodeDurationsDialogs({ viewModel }: Readonly<EpisodeDurationsDialogsProps>) {
  const edit = viewModel.editView;
  const add = viewModel.addView;
  return (
    <>
      <Modal isOpen={edit !== undefined} onOpenChange={viewModel.onCloseEdit}>
        <Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{edit?.title}</Modal.Heading>
            <Typography color="muted" type="body-sm">{edit?.sourceLine}</Typography>
          </Modal.Header>
          <Modal.Body>
            {edit === undefined ? null : (
              <LabeledTextField
                description="A manual value is kept when the folder is re-analyzed."
                label="Minutes"
                min={1}
                type="number"
                value={edit.minutes}
                onChange={viewModel.onEditMinutesChange}
              />
            )}
          </Modal.Body>
          <Modal.Footer className="justify-between">
            <Button className="text-danger hover:text-danger" isDisabled={edit?.canClear !== true} variant="tertiary" onPress={viewModel.onClearEdit}>Clear duration</Button>
            <span className="flex gap-2">
              <Button variant="tertiary" onPress={viewModel.onCloseEdit}>Cancel</Button>
              <Button isDisabled={edit?.canApply !== true} variant="primary" onPress={viewModel.onApplyEdit}>Apply</Button>
            </span>
          </Modal.Footer>
        </Modal.Dialog></Modal.Container></Modal.Backdrop>
      </Modal>

      <Modal isOpen={add !== undefined} onOpenChange={viewModel.onCloseAdd}>
        <Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="sm:max-w-md">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>Add episode</Modal.Heading>
            <Typography color="muted" type="body-sm">For an episode whose file is not here yet.</Typography>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            {add === undefined ? null : (
              <div className="grid grid-cols-2 gap-3">
                <LabeledTextField
                  description={add.episodeHint}
                  errorMessage={add.duplicateMessage}
                  label="Episode"
                  min={1}
                  type="number"
                  value={add.episode}
                  onChange={viewModel.onAddEpisodeChange}
                />
                <LabeledTextField label="Minutes" min={1} type="number" value={add.minutes} onChange={viewModel.onAddMinutesChange} />
              </div>
            )}
            {add?.isLongHintVisible === true ? <Typography className="text-warning" type="body-xs">Above 30 min: marked as long</Typography> : null}
            <Typography color="muted" type="body-xs">Saved as a manual value. When the file arrives, re-analysis shows the measured duration next to it and you decide.</Typography>
          </Modal.Body>
          <Modal.Footer className="justify-between">
            {add?.editInsteadLabel === undefined ? <span /> : (
              <Button className="text-accent" variant="ghost" onPress={viewModel.onEditInstead}>{add.editInsteadLabel}</Button>
            )}
            <span className="flex gap-2">
              <Button variant="tertiary" onPress={viewModel.onCloseAdd}>Cancel</Button>
              <Button isDisabled={add?.canAdd !== true} variant="primary" onPress={viewModel.onApplyAdd}>Add</Button>
            </span>
          </Modal.Footer>
        </Modal.Dialog></Modal.Container></Modal.Backdrop>
      </Modal>

      <EpisodeReanalysisReviewModal viewModel={viewModel} />
    </>
  );
}
