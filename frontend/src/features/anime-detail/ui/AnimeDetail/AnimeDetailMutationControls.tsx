import { Alert, Button, Modal, Typography } from '@heroui/react';
import { ANIME_DETAIL_CANCEL_LABEL } from './anime-detail.constants';
import type { AnimeDetailMutationControlsProps } from './anime-detail.types';

/**
 * Renders the mutation feedback alert and confirmation modal while the hook
 * owns every decision and side effect; the Repeat/Restore buttons that open
 * the modal live in the hero header (`AnimeDetailMutationActions`).
 */
export function AnimeDetailMutationControls(props: Readonly<AnimeDetailMutationControlsProps>) {
  return (
    <>
      {props.feedback === undefined ? null : (
        <Alert status={props.feedback.status}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{props.feedback.title}</Alert.Title>
            <Alert.Description>{props.feedback.description}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Modal isOpen={props.confirmation !== undefined} onOpenChange={props.onConfirmationOpenChange}>
        <Modal.Backdrop isDismissable={!props.isMutating} variant="blur">
          <Modal.Container>
            <Modal.Dialog className="sm:max-w-md">
              <Modal.Header>
                <Modal.Heading>{props.confirmation?.heading}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Typography color="muted" type="body-sm">
                  {props.confirmation?.description}
                </Typography>
              </Modal.Body>
              <Modal.Footer>
                <Button isDisabled={props.isMutating} onPress={props.onCancelAction} variant="tertiary">
                  {ANIME_DETAIL_CANCEL_LABEL}
                </Button>
                <Button isPending={props.isMutating} onPress={() => void props.onConfirmAction()} variant="primary">
                  {props.confirmation?.confirmLabel}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
