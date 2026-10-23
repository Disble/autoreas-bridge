import { Chip, DateField, DateRangePicker, RangeCalendar, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { Icon } from '@iconify/react';
import calendarIcon from '@iconify-icons/solar/calendar-bold';
import closeIcon from '@iconify-icons/solar/close-circle-bold';
import bridgeIcon from '@iconify-icons/solar/server-bold';
import phoneIcon from '@iconify-icons/solar/smartphone-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_ALL_TYPES_KEY } from '../../feed/activity-feed.constants';
import { ActivityFailureButton } from './ActivityFailureButton';
import type { ActivityToolbarProps } from './activity-toolbar.types';

/**
 * The feed toolbar, one row: the range field (the same range the chart
 * edits), origin, the type toggles with their counts, and the failure
 * button. On a narrow window the types and the failure button wrap together.
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
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Activity filters">
      <div className="flex items-center gap-1">
        <DateRangePicker aria-label="Time range" maxValue={calendarMax} minValue={calendarMin} onChange={onCalendarChange} value={calendarValue}>
          <DateField.Group variant="secondary">
            <DateRangePicker.Trigger aria-label={`Time range, ${rangeLabel}`} className="h-full gap-2 px-3">
              <Icon aria-hidden icon={calendarIcon} />
              <span className={hasRange ? 'whitespace-nowrap text-field-foreground' : 'whitespace-nowrap text-field-placeholder'}>{rangeLabel}</span>
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
        {hasRange ? <IconActionButton ariaLabel="Clear time range" icon={closeIcon} onPress={onClearRange} tooltip="Clear time range" variant="ghost" /> : null}
      </div>
      <ToggleButtonGroup aria-label="Where" disallowEmptySelection onSelectionChange={onOriginChange} selectedKeys={[origin]} selectionMode="single" size="sm">
        <ToggleButton id="all">All</ToggleButton>
        <ToggleButton aria-label="Phone" id="phone">
          <Icon aria-hidden icon={phoneIcon} />
        </ToggleButton>
        <ToggleButton aria-label="Bridge" id="bridge">
          <Icon aria-hidden icon={bridgeIcon} />
        </ToggleButton>
      </ToggleButtonGroup>
      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
        <ToggleButtonGroup
          aria-label="What"
          className={failuresOnly ? 'flex-wrap opacity-60' : 'flex-wrap'}
          onSelectionChange={onTypesChange}
          selectedKeys={typeKeys}
          selectionMode="multiple"
          size="sm"
        >
          <ToggleButton id={ACTIVITY_ALL_TYPES_KEY}>All</ToggleButton>
          {typeToggles.map((toggle) => (
            <ToggleButton id={toggle.type} key={toggle.type}>
              {toggle.label}
              {toggle.lines === undefined ? null : (
                <Chip size="sm" variant="soft">
                  {toggle.lines}
                </Chip>
              )}
              {toggle.failed === 0 ? null : (
                <Chip aria-label={`${toggle.failed} failed`} color="danger" size="sm" title={`${toggle.failed} failed`} variant="soft">
                  {toggle.failed}
                </Chip>
              )}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <ActivityFailureButton {...failure} />
      </div>
    </div>
  );
}
