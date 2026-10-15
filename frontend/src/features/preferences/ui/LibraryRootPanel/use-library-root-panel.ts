import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@heroui/react';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import {
  LIBRARY_ROOT_ERROR_MESSAGE,
  LIBRARY_ROOT_PICKER_TITLE,
  LIBRARY_ROOT_SAVED_MESSAGE,
} from './library-root-panel.constants';
import type { LibraryRootPanelProps, LibraryRootSource } from './library-root-panel.types';
import { useLibraryRootChange } from './use-library-root-change';

/**
 * useLibraryRootPanel drives the Options "Library" tab: it loads the current
 * global library root, lets the user edit it by hand or via the native folder
 * picker, and persists it. Saving first previews the change through
 * useLibraryRootChange, which waits for confirmation when active animes would
 * follow the new root. Wails I/O flows through the injectable preferences
 * source; the field is "dirty" until a load or a successful save re-baselines it.
 */
export function useLibraryRootPanel(props: Readonly<LibraryRootPanelProps> = {}) {
  // 2. State
  const [root, setRoot] = useState('');
  const [initialRoot, setInitialRoot] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 5. Derived State (useMemo)
  const source: LibraryRootSource = useMemo(() => props.source ?? preferencesSource, [props.source]);
  const isDirty = root !== initialRoot;

  // 6. Callbacks
  const onRootChange = useCallback((value: string) => {
    setRoot(value);
  }, []);

  const onBrowse = useCallback(() => {
    return source.pickFolder(LIBRARY_ROOT_PICKER_TITLE).then((picked) => {
      if (picked !== '') {
        setRoot(picked);
      }
    });
  }, [source]);

  const fail = useCallback((message: string) => {
    setErrorMessage(message);
    toast.danger(LIBRARY_ROOT_ERROR_MESSAGE);
  }, []);

  const persist = useCallback(() => {
    setIsSaving(true);
    setErrorMessage('');
    return source
      .setLibraryRoot(root)
      .then((status) => {
        if (status !== 'ok') {
          fail(status);
          return;
        }
        setInitialRoot(root);
        toast.success(LIBRARY_ROOT_SAVED_MESSAGE);
      })
      .catch(() => {
        fail(LIBRARY_ROOT_ERROR_MESSAGE);
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [fail, root, source]);

  const change = useLibraryRootChange({ source, root, persist, fail, setIsSaving });

  // 7. Effects
  useEffect(() => {
    void source.getLibraryRoot().then((current) => {
      setRoot(current);
      setInitialRoot(current);
    });
  }, [source]);

  return {
    root,
    onRootChange,
    onBrowse,
    isDirty,
    isSaving,
    errorMessage,
    ...change,
  };
}
