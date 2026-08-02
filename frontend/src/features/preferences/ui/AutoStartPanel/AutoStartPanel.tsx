import { Alert, Switch } from '@heroui/react';
import type { AutoStartPanelProps } from './auto-start-panel.types';
import { useAutoStartPanel } from './use-auto-start-panel';

/** Renders the login-launch setting with state supplied by its colocated hook. */
export function AutoStartPanel(props: Readonly<AutoStartPanelProps>) {
  const { enabled, isSaving, errorMessage, onEnabledChange } = useAutoStartPanel(props);

  return (
    <div className="flex flex-col gap-3">
      {errorMessage !== '' && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Switch isDisabled={isSaving} isSelected={enabled} onChange={(value) => void onEnabledChange(value)}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Launch Autoreas Bridge when I sign in to Windows
        </Switch.Content>
      </Switch>
      <p className="text-sm text-muted">Bridge starts hidden and stays available from the system tray.</p>
    </div>
  );
}
