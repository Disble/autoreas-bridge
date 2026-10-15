import { Alert, Button, Chip, Modal, Typography } from '@heroui/react';
import {
  LIBRARY_ROOT_CHANGE_DISK_WARNING,
  LIBRARY_ROOT_CHANGE_KEPT_LABEL,
  LIBRARY_ROOT_CHANGE_MOVES_LABEL,
  LIBRARY_ROOT_CHANGE_TITLE,
} from './library-root-panel.constants';
import { libraryRootChangeConfirmLabel, libraryRootChangeSummary } from './library-root-panel.helpers';
import type { LibraryRootChangeModalProps } from './library-root-panel.types';

/**
 * LibraryRootChangeModal confirms a library root change that moves active
 * animes (ADR 027 D4): the old and new root, each anime with its new folder,
 * the active animes left as they are, and a reminder that files stay on disk.
 */
export function LibraryRootChangeModal({ pendingChange, count, onOpenChange, onConfirm, onCancel }: Readonly<LibraryRootChangeModalProps>) {
  return (
    <Modal isOpen={pendingChange !== null} onOpenChange={onOpenChange}>
      <Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="sm:max-w-xl">
        <Modal.CloseTrigger />
        <Modal.Header>
          <Modal.Heading>{LIBRARY_ROOT_CHANGE_TITLE}</Modal.Heading>
          <Typography className="break-all font-mono" color="muted" type="body-xs">
            {pendingChange?.oldRoot} → {pendingChange?.newRoot}
          </Typography>
        </Modal.Header>
        <Modal.Body className="flex flex-col gap-3">
          <Typography type="body-sm">{libraryRootChangeSummary(count)}</Typography>
          <div className="flex items-center gap-2">
            <Typography type="body-sm">{LIBRARY_ROOT_CHANGE_MOVES_LABEL}</Typography>
            <Chip color="accent" size="sm" variant="soft">{count} active</Chip>
          </div>
          <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {pendingChange?.moves.map((move) => (
              <li className="flex min-w-0 flex-col" key={move.animeId}>
                <Typography className="truncate" type="body-sm">{move.name}</Typography>
                <Typography className="break-all font-mono" color="muted" type="body-xs">{move.to}</Typography>
              </li>
            ))}
          </ul>
          {pendingChange === null || pendingChange.kept.length === 0 ? null : (
            <div className="flex flex-col gap-2">
              <Typography type="body-sm">{LIBRARY_ROOT_CHANGE_KEPT_LABEL}</Typography>
              <ul className="flex flex-col gap-2">
                {pendingChange.kept.map((kept) => (
                  <li className="flex min-w-0 flex-col" key={kept.animeId}>
                    <Typography className="truncate" type="body-sm">{kept.name}</Typography>
                    <Typography className="break-all font-mono" color="muted" type="body-xs">{kept.folder}</Typography>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{LIBRARY_ROOT_CHANGE_DISK_WARNING}</Alert.Description>
            </Alert.Content>
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onPress={onCancel}>Cancel</Button>
          <Button variant="primary" onPress={onConfirm}>{libraryRootChangeConfirmLabel(count)}</Button>
        </Modal.Footer>
      </Modal.Dialog></Modal.Container></Modal.Backdrop>
    </Modal>
  );
}
