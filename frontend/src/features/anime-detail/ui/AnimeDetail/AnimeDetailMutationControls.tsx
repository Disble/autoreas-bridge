import { Alert, Button, ButtonGroup, Modal, Typography } from '@heroui/react';
import {
  ANIME_DETAIL_CANCEL_LABEL,
  ANIME_DETAIL_REPEAT_LABEL,
  ANIME_DETAIL_RESTORE_LABEL,
} from './anime-detail.constants';
import type { AnimeDetailMutationControlsProps } from './anime-detail.types';

/** Renders display-ready mutation controls while the hook owns every decision and side effect. */
export function AnimeDetailMutationControls(props: Readonly<AnimeDetailMutationControlsProps>) {
  return (
    <>
      {props.detail.canRepeat || props.detail.canRestore ? (
        <ButtonGroup className="self-start">
          {props.detail.canRepeat ? (
            <Button isDisabled={props.isMutating} onPress={props.onRequestRepeat} variant="primary">
              {ANIME_DETAIL_REPEAT_LABEL}
            </Button>
          ) : null}
          {props.detail.canRestore ? (
            <Button isDisabled={props.isMutating} onPress={props.onRequestRestore} variant="secondary">
              {ANIME_DETAIL_RESTORE_LABEL}
            </Button>
          ) : null}
        </ButtonGroup>
      ) : null}

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
