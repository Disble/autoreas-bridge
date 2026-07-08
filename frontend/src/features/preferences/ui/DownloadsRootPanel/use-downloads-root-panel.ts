import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@heroui/react';
import { preferencesSource } from '../../../../infrastructure/preferences-source';
import {
  DOWNLOADS_ROOT_ERROR_MESSAGE,
  DOWNLOADS_ROOT_PICKER_TITLE,
  DOWNLOADS_ROOT_SAVED_MESSAGE,
} from './downloads-root-panel.constants';
import type { DownloadsRootPanelProps, DownloadsRootSource } from './downloads-root-panel.types';

/**
 * useDownloadsRootPanel drives the Options "Downloads" tab: it loads the current
 * global downloads root, lets the user edit it by hand or via the native folder
 * picker, and persists it. Wails I/O flows through the injectable preferences
 * source; the field is "dirty" until a load or a successful save re-baselines it.
 */
export function useDownloadsRootPanel(props: Readonly<DownloadsRootPanelProps> = {}) {
  // 2. State
  const [root, setRoot] = useState('');
  const [initialRoot, setInitialRoot] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 5. Derived State (useMemo)
  const source: DownloadsRootSource = useMemo(() => props.source ?? preferencesSource, [props.source]);
  const isDirty = root !== initialRoot;

  // 6. Callbacks
  const onRootChange = useCallback((value: string) => {
    setRoot(value);
  }, []);

  const onBrowse = useCallback(() => {
    return source.pickFolder(DOWNLOADS_ROOT_PICKER_TITLE).then((picked) => {
      if (picked !== '') {
        setRoot(picked);
      }
    });
  }, [source]);

  const onSave = useCallback(() => {
    setIsSaving(true);
    setErrorMessage('');
    return source
      .setDownloadsRoot(root)
      .then((status) => {
        if (status !== 'ok') {
          setErrorMessage(status);
          toast.danger(DOWNLOADS_ROOT_ERROR_MESSAGE);
          return;
        }
        setInitialRoot(root);
        toast.success(DOWNLOADS_ROOT_SAVED_MESSAGE);
      })
      .catch(() => {
        setErrorMessage(DOWNLOADS_ROOT_ERROR_MESSAGE);
        toast.danger(DOWNLOADS_ROOT_ERROR_MESSAGE);
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [root, source]);

  // 7. Effects
  useEffect(() => {
    void source.getDownloadsRoot().then((current) => {
      setRoot(current);
      setInitialRoot(current);
    });
  }, [source]);

  return {
    root,
    onRootChange,
    onBrowse,
    onSave,
    isDirty,
    isSaving,
    errorMessage,
  };
}
