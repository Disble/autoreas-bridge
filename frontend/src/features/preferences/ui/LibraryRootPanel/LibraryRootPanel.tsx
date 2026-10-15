import { Alert, Button, Input, Label, TextField } from '@heroui/react';
import { LIBRARY_ROOT_DESCRIPTION, LIBRARY_ROOT_LABEL } from './library-root-panel.constants';
import type { LibraryRootPanelProps } from './library-root-panel.types';
import { LibraryRootChangeModal } from './LibraryRootChangeModal';
import { useLibraryRootPanel } from './use-library-root-panel';

/**
 * LibraryRootPanel is the Options "Library" tab body: it shows and edits the
 * global library root, and confirms a change that moves active animes.
 * Presentation-only — all I/O and state live in the colocated
 * useLibraryRootPanel hook.
 */
export function LibraryRootPanel(props: Readonly<LibraryRootPanelProps>) {
  const panel = useLibraryRootPanel(props);

  return (
    <div className="flex flex-col gap-3">
      {panel.errorMessage !== '' && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{panel.errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <TextField value={panel.root} onChange={panel.onRootChange}>
        <Label>{LIBRARY_ROOT_LABEL}</Label>
        <Input placeholder="D:\Anime" />
      </TextField>

      <p className="text-sm text-muted">{LIBRARY_ROOT_DESCRIPTION}</p>

      <div className="flex gap-2">
        <Button variant="secondary" onPress={() => void panel.onBrowse()}>
          Browse
        </Button>
        <Button isDisabled={!panel.isDirty || panel.isSaving} variant="primary" onPress={() => void panel.onSave()}>
          Save
        </Button>
      </div>

      <LibraryRootChangeModal
        count={panel.changeCount}
        pendingChange={panel.pendingChange}
        onCancel={panel.onCancelChange}
        onConfirm={() => void panel.onConfirmChange()}
        onOpenChange={panel.onChangeOpenChange}
      />
    </div>
  );
}
