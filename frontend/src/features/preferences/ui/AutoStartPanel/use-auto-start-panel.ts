import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@heroui/react';
import { preferencesSource } from '../../../../infrastructure/preferences-source/preferences-source.helpers';
import { AUTO_START_ERROR_MESSAGE, AUTO_START_SAVED_MESSAGE } from './auto-start-panel.constants';
import { isAutoStartSaved } from './auto-start-panel.helpers';
import type { AutoStartPanelProps } from './auto-start-panel.types';

/**
 * Loads and persists the Windows login-launch preference behind an injectable
 * desktop-runtime source.
 */
export function useAutoStartPanel(props: Readonly<AutoStartPanelProps> = {}) {
  // 1. Refs

  // 2. State
  const [enabled, setEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const source = useMemo(() => props.source ?? preferencesSource, [props.source]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onEnabledChange = useCallback(
    (nextEnabled: boolean) => {
      setIsSaving(true);
      setErrorMessage('');
      return source
        .setAutoStartEnabled(nextEnabled)
        .then((status) => {
          if (!isAutoStartSaved(status)) {
            setErrorMessage(status);
            toast.danger(AUTO_START_ERROR_MESSAGE);
            return;
          }
          setEnabled(nextEnabled);
          toast.success(AUTO_START_SAVED_MESSAGE);
        })
        .catch(() => {
          setErrorMessage(AUTO_START_ERROR_MESSAGE);
          toast.danger(AUTO_START_ERROR_MESSAGE);
        })
        .finally(() => {
          setIsSaving(false);
        });
    },
    [source],
  );

  // 7. Effects
  useEffect(() => {
    void source.getAutoStartEnabled().then(setEnabled);
  }, [source]);

  return {
    enabled,
    isSaving,
    errorMessage,
    onEnabledChange,
  };
}
