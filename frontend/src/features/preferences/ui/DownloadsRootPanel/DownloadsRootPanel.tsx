import { Alert, Button, Input, Label, TextField } from '@heroui/react';
import { DOWNLOADS_ROOT_DESCRIPTION, DOWNLOADS_ROOT_LABEL } from './downloads-root-panel.constants';
import type { DownloadsRootPanelProps } from './downloads-root-panel.types';
import { useDownloadsRootPanel } from './use-downloads-root-panel';

/**
 * DownloadsRootPanel is the Options "Downloads" tab body: it shows and edits the
 * global downloads root. Presentation-only — all I/O and state live in the
 * colocated useDownloadsRootPanel hook.
 */
export function DownloadsRootPanel(props: Readonly<DownloadsRootPanelProps>) {
  const { root, onRootChange, onBrowse, onSave, isDirty, isSaving, errorMessage } = useDownloadsRootPanel(props);

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
        <Label>{DOWNLOADS_ROOT_LABEL}</Label>
        <Input placeholder="D:\Anime" />
      </TextField>

      <p className="text-sm text-muted">{DOWNLOADS_ROOT_DESCRIPTION}</p>

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
