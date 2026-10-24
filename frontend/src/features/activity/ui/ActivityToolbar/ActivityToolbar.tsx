import { DateField, DateRangePicker, RangeCalendar, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { Icon } from '@iconify/react';
import calendarIcon from '@iconify-icons/solar/calendar-linear';
import closeIcon from '@iconify-icons/solar/close-circle-bold';
import bridgeIcon from '@iconify-icons/solar/monitor-linear';
import phoneIcon from '@iconify-icons/solar/smartphone-linear';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_ALL_TYPES_KEY, ACTIVITY_SEGMENT_BUTTON_CLASS, ACTIVITY_SEGMENT_GROUP_CLASS } from '../../feed/activity-feed.constants';
import { ActivityFailureButton } from './ActivityFailureButton';
import { ACTIVITY_COUNT_CHIP_CLASS, ACTIVITY_FAILED_CHIP_CLASS } from './activity-toolbar.constants';
import type { ActivityToolbarProps } from './activity-toolbar.types';

/**
 * The feed toolbar (activity-ui-design-v2.md, Filters): the range field (the
 * same range the chart edits), origin, then the type toggles with their counts
 * and the failure button at the end of their row. When the window is too
 * narrow for one row, the types and the failure button wrap together.
 */
export function ActivityToolbar({
  rangeLabel,
  hasRange,
  calendarValue,
  calendarMin,
  calendarMax,
  onCalendarChange,
  onClearRange,
  origin,
  onOriginChange,
  typeToggles,
  typeKeys,
  failuresOnly,
  onTypesChange,
  failure,
}: ActivityToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-separator pb-3.5" role="toolbar" aria-label="Activity filters">
      {/* The clear × sits inside the field visually but outside the picker: React Aria makes any button in the picker its trigger. */}
      <div className="relative flex min-w-0 max-w-[360px] flex-[1_1_220px] items-center">
        <DateRangePicker aria-label="Time range" className="w-full" maxValue={calendarMax} minValue={calendarMin} onChange={onCalendarChange} value={calendarValue}>
          <DateField.Group className="h-9 w-full rounded-xl" variant="secondary">
            <DateRangePicker.Trigger aria-label={`Time range, ${rangeLabel}`} className={hasRange ? 'h-full w-full justify-start gap-2 pl-3 pr-9' : 'h-full w-full justify-start gap-2 px-3'}>
              <Icon aria-hidden className="shrink-0 text-muted" icon={calendarIcon} />
              <span className={hasRange ? 'truncate tabular-nums text-field-foreground' : 'truncate tabular-nums text-field-placeholder'}>{rangeLabel}</span>
            </DateRangePicker.Trigger>
          </DateField.Group>
          <DateRangePicker.Popover>
            <RangeCalendar aria-label="Pick a time range">
              <RangeCalendar.Header>
                <RangeCalendar.Heading />
                <RangeCalendar.NavButton slot="previous" />
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>{(day) => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>{(date) => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
              </RangeCalendar.Grid>
            </RangeCalendar>
          </DateRangePicker.Popover>
        </DateRangePicker>
        {hasRange ? (
          <span className="absolute right-1 top-1/2 -translate-y-1/2">
            <IconActionButton ariaLabel="Clear time range" icon={closeIcon} onPress={onClearRange} tooltip="Clear time range" variant="ghost" />
          </span>
        ) : null}
      </div>
      <ToggleButtonGroup
        aria-label="Where"
        className={ACTIVITY_SEGMENT_GROUP_CLASS}
        disallowEmptySelection
        isDetached
        onSelectionChange={onOriginChange}
        selectedKeys={[origin]}
        selectionMode="single"
        size="sm"
      >
        <ToggleButton className={ACTIVITY_SEGMENT_BUTTON_CLASS} id="all" variant="ghost">
          All
        </ToggleButton>
        <ToggleButton aria-label="Phone" className={ACTIVITY_SEGMENT_BUTTON_CLASS} id="phone" variant="ghost">
          <Icon aria-hidden icon={phoneIcon} />
        </ToggleButton>
        <ToggleButton aria-label="Bridge" className={ACTIVITY_SEGMENT_BUTTON_CLASS} id="bridge" variant="ghost">
          <Icon aria-hidden icon={bridgeIcon} />
        </ToggleButton>
      </ToggleButtonGroup>
      <div className="flex min-w-0 flex-[1_1_auto] items-center gap-2.5" data-activity-types-row>
        <ToggleButtonGroup
          aria-label="What"
          className={`${ACTIVITY_SEGMENT_GROUP_CLASS} max-w-full justify-start overflow-x-auto ${failuresOnly ? 'opacity-45' : ''}`}
          isDetached
          onSelectionChange={onTypesChange}
          selectedKeys={typeKeys}
          selectionMode="multiple"
          size="sm"
        >
          <ToggleButton className={ACTIVITY_SEGMENT_BUTTON_CLASS} id={ACTIVITY_ALL_TYPES_KEY} variant="ghost">
            All
          </ToggleButton>
          {typeToggles.map((toggle) => (
            <ToggleButton className={ACTIVITY_SEGMENT_BUTTON_CLASS} id={toggle.type} key={toggle.type} variant="ghost">
              {toggle.label}
              {toggle.lines === undefined ? null : <span className={ACTIVITY_COUNT_CHIP_CLASS}>{toggle.lines}</span>}
              {toggle.failed === 0 ? null : (
                <span aria-label={`${toggle.failed} failed`} className={ACTIVITY_FAILED_CHIP_CLASS} role="img" title={`${toggle.failed} failed`}>
                  {toggle.failed}
                </span>
              )}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <span className="flex-1" />
        <ActivityFailureButton {...failure} />
      </div>
    </div>
  );
}
