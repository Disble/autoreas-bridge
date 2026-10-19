import { Alert, Button } from '@heroui/react';
import type { ActivityHistoryFailureProps } from './activity-history.types';

/** The History failure alert with its retry. */
export function ActivityHistoryFailure({ retry }: ActivityHistoryFailureProps) {
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Activity could not read its history</Alert.Title>
        <Alert.Description>The rest of the app keeps working.</Alert.Description>
        <Button className="mt-2 self-start" onPress={retry} size="sm" variant="secondary">
          Try again
        </Button>
      </Alert.Content>
    </Alert>
  );
}
