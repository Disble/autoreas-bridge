import clockIcon from '@iconify-icons/solar/clock-circle-linear';
import { Icon } from '@iconify/react';
import { Alert, Button, Description, FieldError, Label, Popover, Skeleton, TimeField } from '@heroui/react';
import {
  CHECK_TIME_HEADING,
  CHECK_TIME_HINT,
  CHECK_TIME_LOAD_FAILED_TITLE,
  CHECK_TIME_LOADING_LABEL,
  CHECK_TIME_LOADING_LABEL_ID,
  CHECK_TIME_TRIGGER_PREFIX,
} from './intake-check-time.constants';
import type { IntakeCheckTimeProps } from './intake-check-time.types';
import { useIntakeCheckTime } from './use-intake-check-time';

/**
 * IntakeCheckTime is the intake card's quiet "Daily check HH:MM" control: a
 * muted tertiary trigger that opens a popover to change the local time of the
 * daily availability check, followed by a thin separator from the Raw/List
 * toggle. While the `settings` module starts it is a labelled skeleton of the
 * trigger, and a failed read shows a compact danger Alert in its place.
 * All state and Wails I/O live in the colocated `useIntakeCheckTime` hook.
 */
export function IntakeCheckTime({ source }: Readonly<IntakeCheckTimeProps>) {
  const { view, isOpen, onOpenChange, draft, onDraftChange, isSaving, errorMessage, onSave } = useIntakeCheckTime(source);
  const separator = <span aria-hidden="true" className="mx-1 h-5 w-px bg-separator" />;

  if (view.kind === 'loading') {
    return (
      <>
        <div aria-labelledby={CHECK_TIME_LOADING_LABEL_ID} aria-live="polite" role="status">
          <span className="sr-only" id={CHECK_TIME_LOADING_LABEL_ID}>{CHECK_TIME_LOADING_LABEL}</span>
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
        {separator}
      </>
    );
  }

  if (view.kind === 'failure') {
    return (
      <>
        <Alert className="max-w-xs py-1" status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{CHECK_TIME_LOAD_FAILED_TITLE}</Alert.Title>
            <Alert.Description>{view.message}</Alert.Description>
          </Alert.Content>
        </Alert>
        {separator}
      </>
    );
  }

  if (view.kind !== 'ready') {
    return null;
  }

  return (
    <>
      <Popover isOpen={isOpen} onOpenChange={onOpenChange}>
        <Button className="text-muted" size="sm" variant="tertiary">
          <Icon aria-hidden="true" className="size-4" icon={clockIcon} />
          {CHECK_TIME_TRIGGER_PREFIX} {view.data}
        </Button>
        <Popover.Content placement="bottom end">
          <Popover.Dialog className="flex w-64 flex-col gap-3">
            <TimeField hourCycle={24} isInvalid={errorMessage !== undefined} value={draft} onChange={onDraftChange}>
              <Label>{CHECK_TIME_HEADING}</Label>
              <TimeField.Group>
                <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
              </TimeField.Group>
              <FieldError>{errorMessage}</FieldError>
              <Description>{CHECK_TIME_HINT}</Description>
            </TimeField>
            <div className="flex justify-end gap-2">
              <Button size="sm" slot="close" variant="tertiary">
                Cancel
              </Button>
              <Button isPending={isSaving} size="sm" variant="primary" onPress={onSave}>
                Save
              </Button>
            </div>
          </Popover.Dialog>
        </Popover.Content>
      </Popover>
      {separator}
    </>
  );
}
