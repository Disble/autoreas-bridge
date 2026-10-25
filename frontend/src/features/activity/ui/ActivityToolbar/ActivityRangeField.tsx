import { Button, DateField, DateRangePicker, Label, RangeCalendar, TimeField } from '@heroui/react';
import { Icon } from '@iconify/react';
import calendarIcon from '@iconify-icons/solar/calendar-linear';
import clockIcon from '@iconify-icons/solar/clock-circle-linear';
import closeIcon from '@iconify-icons/solar/close-circle-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_RANGE_CALENDAR_CLASS, ACTIVITY_RANGE_CELL_CLASS, ACTIVITY_RANGE_POPOVER_CLASS } from './activity-toolbar.constants';
import { toWeekdayHead } from './activity-toolbar.helpers';
import type { ActivityRangeFieldProps } from './activity-toolbar.types';

/**
 * The range field (activity-ui-design-v2.md, Filters; mockup `.ax-dr`) and its
 * picker: the range calendar, then the start and end times, then Clear and
 * Apply. The pick is a draft until Apply.
 */
export function ActivityRangeField({ rangeLabel, hasRange, calendarMin, calendarMax, onClearRange, picker }: ActivityRangeFieldProps) {
  return (
    // The clear × sits inside the field visually but outside the picker: React Aria makes any button in the picker its trigger.
    <div className="relative flex w-max min-w-[250px] max-w-full flex-none items-center">
      <DateRangePicker
        aria-label="Time range"
        className="w-full"
        isOpen={picker.isOpen}
        maxValue={calendarMax}
        minValue={calendarMin}
        onChange={picker.onDaysChange}
        onOpenChange={picker.onOpenChange}
        shouldCloseOnSelect={false}
        value={picker.days}
      >
        <DateField.Group className="h-9 w-full rounded-xl" variant="secondary">
          <DateRangePicker.Trigger aria-label={`Time range, ${rangeLabel}`} className="h-full w-full justify-start gap-2 pl-3 pr-9">
            <Icon aria-hidden className="shrink-0 text-muted" icon={calendarIcon} />
            <span className={hasRange ? 'truncate tabular-nums text-field-foreground' : 'truncate tabular-nums text-field-placeholder'}>{rangeLabel}</span>
          </DateRangePicker.Trigger>
        </DateField.Group>
        <DateRangePicker.Popover className={ACTIVITY_RANGE_POPOVER_CLASS} placement="bottom start">
          {/* Capture sees Enter / Space before the day cell's press handling stops it; the cells take no key handlers. */}
          <div onKeyDownCapture={picker.onCalendarKeyDown}>
            <RangeCalendar aria-label="Pick a time range" className={ACTIVITY_RANGE_CALENDAR_CLASS} maxValue={calendarMax} minValue={calendarMin}>
              <RangeCalendar.Header className="pb-2">
                <RangeCalendar.NavButton className="size-7" slot="previous" />
                <RangeCalendar.Heading />
                <RangeCalendar.NavButton className="size-7" slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid weekdayStyle="short">
                <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{toWeekdayHead(day)}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell className={ACTIVITY_RANGE_CELL_CLASS} data-day={date.toString()} date={date} onClick={() => picker.onDayPress(date)} />}</RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <TimeField className="gap-1" onChange={picker.onStartTimeChange} value={picker.startTime}>
              <Label className="text-xs font-normal text-muted">Start time</Label>
              <TimeField.Group className="h-[34px]" variant="secondary">
                <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                <TimeField.Suffix>
                  <Icon aria-hidden className="size-4 text-muted" icon={clockIcon} />
                </TimeField.Suffix>
              </TimeField.Group>
            </TimeField>
            <TimeField className="gap-1" onChange={picker.onEndTimeChange} value={picker.endTime}>
              <Label className="text-xs font-normal text-muted">End time</Label>
              <TimeField.Group className="h-[34px]" variant="secondary">
                <TimeField.Input>{(segment) => <TimeField.Segment segment={segment} />}</TimeField.Input>
                <TimeField.Suffix>
                  <Icon aria-hidden className="size-4 text-muted" icon={clockIcon} />
                </TimeField.Suffix>
              </TimeField.Group>
            </TimeField>
          </div>
          <div className="mt-3.5 flex justify-end gap-2">
            <Button onPress={picker.onClear} size="sm" variant="tertiary">
              Clear
            </Button>
            <Button isDisabled={!picker.canApply} onPress={picker.onApply} size="sm" variant="primary">
              Apply
            </Button>
          </div>
        </DateRangePicker.Popover>
      </DateRangePicker>
      {hasRange ? (
        <span className="absolute right-1 top-1/2 -translate-y-1/2">
          <IconActionButton ariaLabel="Clear time range" icon={closeIcon} onPress={onClearRange} tooltip="Clear time range" variant="ghost" />
        </span>
      ) : null}
    </div>
  );
}
