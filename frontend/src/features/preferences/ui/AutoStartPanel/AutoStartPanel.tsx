import { Alert, Skeleton, Switch } from '@heroui/react';
import { AUTO_START_LOADING_LABEL, AUTO_START_UNAVAILABLE_TITLE } from './auto-start-panel.constants';
import type { AutoStartPanelProps } from './auto-start-panel.types';
import { useAutoStartPanel } from './use-auto-start-panel';

/** Renders the login-launch setting with state supplied by its colocated hook. */
export function AutoStartPanel(props: Readonly<AutoStartPanelProps>) {
  const { view, isSaving, errorMessage, onEnabledChange } = useAutoStartPanel(props);

  if (view.kind === 'failure') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{AUTO_START_UNAVAILABLE_TITLE}</Alert.Title>
          <Alert.Description>{view.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {errorMessage !== '' && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {view.kind === 'ready' ? (
        <Switch isDisabled={isSaving} isSelected={view.data} onChange={onEnabledChange}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            Launch Autoreas Bridge when I sign in to Windows
          </Switch.Content>
        </Switch>
      ) : (
        <div aria-labelledby="auto-start-loading-label" aria-live="polite" className="flex items-center gap-3" role="status">
          <span className="sr-only" id="auto-start-loading-label">{AUTO_START_LOADING_LABEL}</span>
          <Skeleton className="h-5 w-9 rounded-full" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>
      )}
      <p className="text-sm text-muted">Bridge starts hidden and stays available from the system tray.</p>
    </div>
  );
}
