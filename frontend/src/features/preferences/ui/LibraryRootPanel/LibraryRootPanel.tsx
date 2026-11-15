import { Alert, Button, Input, Label, Skeleton, TextField } from '@heroui/react';
import { LIBRARY_ROOT_DESCRIPTION, LIBRARY_ROOT_LABEL, LIBRARY_ROOT_LOADING_LABEL, LIBRARY_ROOT_UNAVAILABLE_TITLE } from './library-root-panel.constants';
import type { LibraryRootPanelProps } from './library-root-panel.types';
import { LibraryRootChangeModal } from './LibraryRootChangeModal';
import { useLibraryRootPanel } from './use-library-root-panel';

/**
 * LibraryRootPanel is the Options "Library" tab body: it shows and edits the
 * global library root, and confirms a change that moves active animes. While
 * the stored root loads it shows the field's label and a skeleton of the field
 * and its buttons; a failed read shows the failure instead of an empty field.
 * Presentation-only — all I/O and state live in the colocated
 * useLibraryRootPanel hook.
 */
export function LibraryRootPanel(props: Readonly<LibraryRootPanelProps>) {
  const panel = useLibraryRootPanel(props);

  if (panel.view.kind === 'failure') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{LIBRARY_ROOT_UNAVAILABLE_TITLE}</Alert.Title>
          <Alert.Description>{panel.view.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (panel.view.kind !== 'ready') {
    return (
      <div aria-labelledby="library-root-loading-label" aria-live="polite" className="flex flex-col gap-3" role="status">
        <span className="sr-only" id="library-root-loading-label">{LIBRARY_ROOT_LOADING_LABEL}</span>
        <p className="text-sm font-medium">{LIBRARY_ROOT_LABEL}</p>
        <Skeleton className="h-10 w-full rounded-lg" />
        <p className="text-sm text-muted">{LIBRARY_ROOT_DESCRIPTION}</p>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20 rounded-lg" />
          <Skeleton className="h-10 w-16 rounded-lg" />
        </div>
      </div>
    );
  }

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
        <Button isDisabled={!panel.isDirty || panel.isSaving} variant="primary" onPress={panel.onSave}>
          Save
        </Button>
      </div>

      <LibraryRootChangeModal
        count={panel.changeCount}
        pendingChange={panel.pendingChange}
        onCancel={panel.onCancelChange}
        onConfirm={panel.onConfirmChange}
        onOpenChange={panel.onChangeOpenChange}
      />
    </div>
  );
}
