import { Alert } from '@heroui/react';
import type { ScheduleSaveErrorAlertProps } from './schedule-panel.types';

/** Renders the save-failure alert when the last config write was rejected, or nothing otherwise. */
export function ScheduleSaveErrorAlert({ message }: Readonly<ScheduleSaveErrorAlertProps>) {
  if (message === undefined) {
    return null;
  }

  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Schedule save failed</Alert.Title>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
