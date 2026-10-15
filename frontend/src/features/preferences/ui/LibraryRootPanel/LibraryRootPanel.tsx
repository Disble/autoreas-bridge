import { Alert, Button, Input, Label, TextField } from '@heroui/react';
import { LIBRARY_ROOT_DESCRIPTION, LIBRARY_ROOT_LABEL } from './library-root-panel.constants';
import type { LibraryRootPanelProps } from './library-root-panel.types';
import { useLibraryRootPanel } from './use-library-root-panel';

/**
 * LibraryRootPanel is the Options "Library" tab body: it shows and edits the
 * global library root. Presentation-only — all I/O and state live in the
 * colocated useLibraryRootPanel hook.
 */
export function LibraryRootPanel(props: Readonly<LibraryRootPanelProps>) {
  const { root, onRootChange, onBrowse, onSave, isDirty, isSaving, errorMessage } = useLibraryRootPanel(props);

  return (
    <div className="flex flex-col gap-3">
      {errorMessage !== '' && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <TextField value={root} onChange={onRootChange}>
        <Label>{LIBRARY_ROOT_LABEL}</Label>
        <Input placeholder="D:\Anime" />
      </TextField>

      <p className="text-sm text-muted">{LIBRARY_ROOT_DESCRIPTION}</p>

      <div className="flex gap-2">
        <Button variant="secondary" onPress={() => void onBrowse()}>
          Browse
        </Button>
        <Button isDisabled={!isDirty || isSaving} variant="primary" onPress={() => void onSave()}>
          Save
        </Button>
      </div>
    </div>
  );
}
