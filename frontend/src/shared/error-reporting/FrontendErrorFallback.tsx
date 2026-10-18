import { Alert, Button } from '@heroui/react';
import { FRONTEND_ERROR_FALLBACK_DESCRIPTION, FRONTEND_ERROR_FALLBACK_TITLE } from './error-reporting.constants';
import type { FrontendErrorFallbackProps } from './error-reporting.types';

/**
 * The minimal screen shown in place of the app when it fails to render.
 * @param props The reload action.
 * @returns The fallback alert.
 */
export function FrontendErrorFallback(props: FrontendErrorFallbackProps) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-background p-6">
      <Alert className="max-w-xl" role="alert" status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{FRONTEND_ERROR_FALLBACK_TITLE}</Alert.Title>
          <Alert.Description>{FRONTEND_ERROR_FALLBACK_DESCRIPTION}</Alert.Description>
        </Alert.Content>
        <Button size="sm" variant="secondary" onPress={props.onReload}>
          Reload
        </Button>
      </Alert>
    </div>
  );
}
