import { useCallback, useState } from 'react';
import { toast } from '@heroui/react';
import { toAsyncView } from '../../../../shared/query/async-view/async-view.helpers';
import { BRIDGE_SETTINGS_SOURCE } from '../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { useBridgeMutation } from '../../../../shared/query/use-bridge-mutation/use-bridge-mutation';
import { useBridgeQuery } from '../../../../shared/query/use-bridge-query/use-bridge-query';
import {
  LIBRARY_ROOT_ERROR_MESSAGE,
  LIBRARY_ROOT_PICKER_TITLE,
  LIBRARY_ROOT_QUERY_KEY,
  LIBRARY_ROOT_SAVED_MESSAGE,
} from './library-root-panel.constants';
import type { LibraryRootPanelProps, LibraryRootView } from './library-root-panel.types';
import { useLibraryRootChange } from './use-library-root-change';

/**
 * useLibraryRootPanel drives the Options "Library" tab: it reads the global
 * library root through `useBridgeQuery` (module `settings`), lets the user edit
 * it by hand or via the native folder picker, and saves it through
 * `useBridgeMutation`. Saving first previews the change through
 * useLibraryRootChange, which waits for confirmation when active animes would
 * follow the new root. The field is "dirty" while an edit differs from the
 * stored root; a successful save re-reads the stored root and drops the edit.
 * @param props The panel props; `source` replaces the Settings port in tests.
 * @returns The root view, the field state and the panel actions.
 */
export function useLibraryRootPanel(props: Readonly<LibraryRootPanelProps> = {}) {
  // 2. State
  const [draft, setDraft] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 3. Context/3rd Party Hooks
  const source = props.source ?? BRIDGE_SETTINGS_SOURCE;

  // 4. Queries/Mutations
  const query = useBridgeQuery({
    queryKey: LIBRARY_ROOT_QUERY_KEY,
    queryFn: () => source.getLibraryRoot(),
    module: 'settings',
  });
  const { refetch } = query;
  const save = useBridgeMutation({
    mutationFn: (path: string) => source.setLibraryRoot(path),
    onMutate: () => {
      setErrorMessage('');
    },
    onSuccess: async () => {
      await refetch();
      setDraft(null);
      toast.success(LIBRARY_ROOT_SAVED_MESSAGE);
    },
    onError: (error) => {
      setErrorMessage(error.message);
      toast.danger(LIBRARY_ROOT_ERROR_MESSAGE);
    },
  });

  // 5. Derived State
  const view: LibraryRootView = toAsyncView(query);
  const storedRoot = view.kind === 'ready' ? view.data : '';
  const root = draft ?? storedRoot;
  const isDirty = draft !== null && draft !== storedRoot;

  // 6. Callbacks
  const onRootChange = useCallback((value: string) => {
    setDraft(value);
  }, []);

  const onBrowse = useCallback(() => {
    return source.pickFolder(LIBRARY_ROOT_PICKER_TITLE).then((picked) => {
      if (picked !== '') {
        setDraft(picked);
      }
    });
  }, [source]);

  const fail = useCallback((message: string) => {
    setErrorMessage(message);
    toast.danger(LIBRARY_ROOT_ERROR_MESSAGE);
  }, []);

  const { mutate } = save;
  const persist = useCallback(() => mutate(root), [mutate, root]);

  const { isPreviewing, ...change } = useLibraryRootChange({ source, root, persist, fail });

  // 7. Effects

  return {
    view,
    root,
    onRootChange,
    onBrowse,
    isDirty,
    isSaving: save.isPending || isPreviewing,
    errorMessage,
    ...change,
  };
}
