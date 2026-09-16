import { Button, Modal, Typography } from '@heroui/react';
import { AnimeScheduleOrdering } from '../../../../shared/ordering/ui/AnimeScheduleOrdering/AnimeScheduleOrdering';
import type { AnimeEditorDialogsProps } from './anime-editor-workspace.types';

/** Renders the shared dirty guard and near-full-screen schedule modal. */
export function AnimeEditorDialogs({ viewModel, scheduleTestDriverRef }: Readonly<AnimeEditorDialogsProps>) {
  return <>
    <Modal isOpen={viewModel.isGuardOpen} onOpenChange={(isOpen) => { if (!isOpen) viewModel.onStayWithCurrentEditor(); }}><Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="sm:max-w-md">
      <Modal.Header><Modal.Heading>Unsaved changes</Modal.Heading></Modal.Header><Modal.Body><Typography type="body-sm">Save and continue, discard and continue, or stay on the current editor state.</Typography></Modal.Body>
      <Modal.Footer><Button isDisabled={viewModel.isSaving} variant="tertiary" onPress={viewModel.onStayWithCurrentEditor}>Stay</Button><Button isDisabled={viewModel.isSaving} variant="secondary" onPress={() => void viewModel.onDiscardAndContinue()}>Discard changes</Button><Button isPending={viewModel.isSaving} variant="primary" onPress={() => void viewModel.onSaveAndContinue()}>Save and continue</Button></Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop></Modal>
    <Modal isOpen={viewModel.lifecycleConfirmation !== undefined} onOpenChange={(isOpen) => { if (!isOpen) viewModel.onCancelLifecycleAction(); }}><Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="sm:max-w-md">
      <Modal.Header><Modal.Heading>{viewModel.lifecycleConfirmation?.heading}</Modal.Heading></Modal.Header><Modal.Body><Typography type="body-sm">{viewModel.lifecycleConfirmation?.description}</Typography></Modal.Body>
      <Modal.Footer><Button isDisabled={viewModel.isSaving} variant="tertiary" onPress={viewModel.onCancelLifecycleAction}>Cancel</Button><Button className={viewModel.lifecycleConfirmation?.isDestructive ? 'text-danger hover:text-danger' : undefined} isPending={viewModel.isSaving} variant="secondary" onPress={() => void viewModel.onConfirmLifecycleAction()}>{viewModel.lifecycleConfirmation?.confirmLabel}</Button></Modal.Footer>
    </Modal.Dialog></Modal.Container></Modal.Backdrop></Modal>
    <Modal isOpen={viewModel.isScheduleModalOpen} onOpenChange={(isOpen) => { if (!isOpen) viewModel.onCloseSchedule(); }}><Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="h-dvh w-full max-w-none"><Modal.Body className="h-full p-4">
      {viewModel.scheduleBoard !== undefined && <AnimeScheduleOrdering board={viewModel.scheduleBoard} feedback={viewModel.scheduleFeedback} isApplying={viewModel.isApplyingSchedule} onApply={viewModel.onApplySchedule} onClose={viewModel.onCloseSchedule} testDriverRef={scheduleTestDriverRef} />}
    </Modal.Body></Modal.Dialog></Modal.Container></Modal.Backdrop></Modal>
  </>;
}
