import { Alert } from '@heroui/react';
import { Icon } from '@iconify/react';
import dangerIcon from '@iconify-icons/solar/danger-circle-bold';
import type { RunHistoryErrorAlertProps } from './run-history-panel.types';

/** A failure line: the danger icon and the message in plain text. */
export function RunHistoryErrorAlert({ message }: Readonly<RunHistoryErrorAlertProps>) {
  return (
    <Alert role="alert" status="danger">
      <Alert.Indicator>
        <Icon aria-hidden="true" className="size-[18px] text-danger" icon={dangerIcon} />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Description className="break-words text-foreground">{message}</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
