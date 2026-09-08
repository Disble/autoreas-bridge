import { Alert, Label, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { WEEKDAY_OPTIONS } from './schedule-panel.constants';
import { weekdayValuesToMask } from './schedule-panel.helpers';
import type { ScheduleWeekdayPickerProps } from './schedule-panel.types';

/**
 * Renders the weekday restriction picker and its "will never run" warning:
 * the two are shown together because the warning only makes sense right
 * beside the control that caused it.
 */
export function ScheduleWeekdayPicker({
  isDisabled,
  selectedWeekdayValues,
  willNeverRun,
  onWeekdaysChange,
}: Readonly<ScheduleWeekdayPickerProps>) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label>Run on these days</Label>
        <ToggleButtonGroup
          aria-label="Days of the week the schedule runs on"
          isDetached
          isDisabled={isDisabled}
          onSelectionChange={(keys) => {
            onWeekdaysChange(weekdayValuesToMask([...keys].map(String)));
          }}
          selectedKeys={selectedWeekdayValues}
          selectionMode="multiple"
          size="sm"
        >
          {WEEKDAY_OPTIONS.map((option) => (
            <ToggleButton id={option.value} key={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      {willNeverRun && (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>No days selected</Alert.Title>
            <Alert.Description>The schedule is enabled but won&apos;t run until you pick at least one day.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </>
  );
}
