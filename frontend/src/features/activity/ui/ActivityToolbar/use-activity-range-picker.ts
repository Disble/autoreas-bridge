import type { CalendarDate, Time } from '@internationalized/date';
import { useCallback, useMemo, useState } from 'react';
import type { ActivityCalendarRange, ActivityFeedFilters, ActivityRange } from '../../feed/activity-feed.types';
import { pressDraftDay, pressDraftDayByKey, toAppliedRange, toDraftTimes, toRangeDraft, toRangeFieldModel } from './activity-toolbar.helpers';
import type { ActivityDayKey, ActivityRangeDraft, ActivityRangeFieldProps } from './activity-toolbar.types';

/**
 * Owns the range field and its picker's popover (mockup, date range picker):
 * the field's text and pickable days come from the filters; in the popover the
 * days and times stay a draft until Apply commits them; Clear clears the
 * range; closing any other way drops the draft.
 *
 * @param filters The screen filters: the picked range, scale and anchor.
 * @param onRangeChange Commits a range, or clears it with undefined.
 * @param onClearRange Clears the range from the × in the field.
 * @returns The range field props.
 */
export function useActivityRangePicker(
  filters: ActivityFeedFilters,
  onRangeChange: (range: ActivityRange | undefined) => void,
  onClearRange: () => void,
): ActivityRangeFieldProps {
  // 1. Refs

  // 2. State
  const { range, scale, anchorMs } = filters;
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<ActivityRangeDraft>(() => toRangeDraft(range));

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const field = useMemo(() => toRangeFieldModel(range, scale, anchorMs), [anchorMs, range, scale]);
  const times = toDraftTimes(draft);

  // 6. Callbacks (useCallback calling pure helpers)
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        setDraft(toRangeDraft(range));
      }
      setIsOpen(open);
    },
    [range],
  );
  const onDaysChange = useCallback((days: ActivityCalendarRange) => setDraft((current) => ({ ...current, days })), []);
  const { calendarMin, calendarMax } = field;
  const onDayPress = useCallback((date: CalendarDate) => setDraft((current) => pressDraftDay(current, date, calendarMin, calendarMax)), [calendarMax, calendarMin]);
  const onCalendarKeyDown = useCallback(
    (key: ActivityDayKey) => setDraft((current) => pressDraftDayByKey(current, key, calendarMin, calendarMax)),
    [calendarMax, calendarMin],
  );
  const onStartTimeChange = useCallback((start: Time | null) => setDraft((current) => ({ ...current, start })), []);
  const onEndTimeChange = useCallback((end: Time | null) => setDraft((current) => ({ ...current, end })), []);
  const onApply = useCallback(() => {
    onRangeChange(toAppliedRange(draft, range, Date.now()));
    setIsOpen(false);
  }, [draft, onRangeChange, range]);
  const onClear = useCallback(() => {
    setIsOpen(false);
    onRangeChange(undefined);
  }, [onRangeChange]);

  // 7. Effects

  return {
    ...field,
    onClearRange,
    picker: {
      isOpen,
      days: draft.days,
      startTime: draft.start,
      endTime: draft.end,
      canApply: draft.days !== null && times !== undefined,
      onOpenChange,
      onDaysChange,
      onDayPress,
      onCalendarKeyDown,
      onStartTimeChange,
      onEndTimeChange,
      onApply,
      onClear,
    },
  };
}
