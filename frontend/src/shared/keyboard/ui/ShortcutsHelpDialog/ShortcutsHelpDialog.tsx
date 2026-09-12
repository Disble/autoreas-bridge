import { Modal, Typography } from '@heroui/react';
import type { ShortcutsHelpDialogProps } from './shortcuts-help-dialog.types';
import { useShortcutsHelpDialog } from './use-shortcuts-help-dialog';

/**
 * Renders the shortcuts overlay from the command registry (plus whatever
 * scope frame is currently active), driven entirely by `isHelpOpen` in the
 * shared keyboard store. There is no trigger element to render: the `?`
 * command is the only way to open it, which the verified `ModalRoot` prop
 * mapping supports directly (design §5 — `isOpen`/`onOpenChange` drive the
 * dialog with no `Modal.Trigger` child, the same shape
 * `AnimeDetailMutationControls.tsx` already uses for a controlled Modal).
 * Escape and backdrop dismissal both flow back through `onOpenChange`, which
 * is React Aria's own behavior.
 */
export function ShortcutsHelpDialog({ commands }: Readonly<ShortcutsHelpDialogProps>) {
  const { isOpen, onOpenChange, sections } = useShortcutsHelpDialog(commands);

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.Header>
              <Modal.Heading>Keyboard shortcuts</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {sections.map((section) => (
                <div key={section.section} aria-label={section.section} role="region">
                  <Typography className="mb-1 uppercase tracking-wide" color="muted" type="body-sm">
                    {section.section}
                  </Typography>
                  <dl className="flex flex-col gap-1">
                    {section.entries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-4">
                        <dt>{entry.label}</dt>
                        <dd>
                          <Typography color="muted" type="code">
                            {entry.display}
                          </Typography>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
