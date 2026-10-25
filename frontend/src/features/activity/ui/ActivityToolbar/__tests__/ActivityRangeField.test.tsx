import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialFilters, toCalendarBounds } from '../../../feed/activity-feed-filters.helpers';
import type { ActivityRange } from '../../../feed/activity-feed.types';
import { ActivityRangeField } from '../ActivityRangeField';
import { pressDraftDayByKey, toKeyPressedDay, toRangeDraft } from '../activity-toolbar.helpers';
import { useActivityRangePicker } from '../use-activity-range-picker';

/** The day 15 of last month: inside the pickable 90 days for any today. */
const FIRST = new Date();
FIRST.setMonth(FIRST.getMonth() - 1, 15);
FIRST.setHours(0, 0, 0, 0);

/** The screen's opening filters: no range picked. */
const INITIAL_FILTERS = createInitialFilters(Date.now());

/** The pickable days, fixed for the whole file. */
const BOUNDS = toCalendarBounds(Date.now());

/** Mounts the field with its picker hook, as the screen does; commits go to `onRangeChange`. */
function Harness({ onRangeChange }: { readonly onRangeChange: (range: ActivityRange | undefined) => void }) {
  const field = useActivityRangePicker(INITIAL_FILTERS, onRangeChange, () => undefined);
  return <ActivityRangeField {...field} />;
}

/** Opens the picker on last month and returns its dialog. */
async function openOnLastMonth() {
  fireEvent.click(screen.getByRole('button', { name: /^Time range, / }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: /previous/i }));
  return dialog;
}

/** The calendar cell of day `day` of last month. */
function cell(dialog: HTMLElement, day: number) {
  const date = new Date(FIRST);
  date.setDate(day);
  return within(dialog).getByRole('button', { name: new RegExp(new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)) });
}

/** Presses a day with Enter, as a keyboard user does: focus, key down, key up. */
function pressEnter(day: HTMLElement) {
  act(() => day.focus());
  fireEvent.keyDown(day, { key: 'Enter' });
  fireEvent.keyUp(day, { key: 'Enter' });
}

/** The range from day 15 of last month to day `lastDay`, whole days. */
function expectedRange(lastDay: number): ActivityRange {
  const end = new Date(FIRST);
  end.setDate(lastDay);
  end.setHours(23, 59, 59, 999);
  return { fromMs: FIRST.getTime(), toMs: end.getTime() };
}

describe('ActivityRangeField', () => {
  afterEach(cleanup);

  it('enables Apply on a first day picked by keyboard, and ends the range with a mouse click', async () => {
    const onRangeChange = vi.fn();
    render(<Harness onRangeChange={onRangeChange} />);
    const dialog = await openOnLastMonth();
    const apply = within(dialog).getByRole('button', { name: 'Apply' });

    pressEnter(cell(dialog, 15));
    expect(apply).toBeEnabled();
    fireEvent.click(cell(dialog, 16));
    fireEvent.click(apply);

    expect(onRangeChange).toHaveBeenCalledExactlyOnceWith(expectedRange(16));
  });

  it('picks a range with the keyboard alone', async () => {
    const onRangeChange = vi.fn();
    render(<Harness onRangeChange={onRangeChange} />);
    const dialog = await openOnLastMonth();
    const apply = within(dialog).getByRole('button', { name: 'Apply' });

    pressEnter(cell(dialog, 15));
    expect(apply).toBeEnabled();
    pressEnter(cell(dialog, 17));
    fireEvent.click(apply);

    expect(onRangeChange).toHaveBeenCalledExactlyOnceWith(expectedRange(17));
  });
});

// A jsdom helper suite: the key target is a DOM element, so it cannot run in the node project.
describe('toKeyPressedDay', () => {
  /** A day cell of 2026-10-20 with its inner text node holder. */
  const day = document.createElement('div');
  day.dataset.day = '2026-10-20';
  const inner = day.appendChild(document.createElement('span'));

  it('presses the cell day on Enter or Space, from the cell or inside it', () => {
    expect(toKeyPressedDay({ key: 'Enter', repeat: false, target: day })?.toString()).toBe('2026-10-20');
    expect(toKeyPressedDay({ key: ' ', repeat: false, target: inner })?.toString()).toBe('2026-10-20');
  });

  it('presses nothing on a repeat, another key, or outside a day cell', () => {
    expect(toKeyPressedDay({ key: 'Enter', repeat: true, target: day })).toBeUndefined();
    expect(toKeyPressedDay({ key: 'ArrowRight', repeat: false, target: day })).toBeUndefined();
    expect(toKeyPressedDay({ key: 'Enter', repeat: false, target: document.createElement('button') })).toBeUndefined();
    expect(toKeyPressedDay({ key: 'Enter', repeat: false, target: new EventTarget() })).toBeUndefined();
  });
});

describe('ActivityRangeField pickable days', () => {
  afterEach(cleanup);

  it('disables the days after today and before the 90-day window', async () => {
    render(<Harness onRangeChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /^Time range, / }));
    const dialog = await screen.findByRole('dialog');
    /** The calendar cell named for `date`. */
    const dayCell = (date: Date) => within(dialog).getByRole('button', { name: new RegExp(new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date)) });
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);

    expect(dayCell(tomorrow)).toHaveAttribute('aria-disabled', 'true');
    expect(within(dialog).getByRole('button', { name: /^Today/ })).not.toHaveAttribute('aria-disabled');
    expect(dayCell(firstOfMonth)).not.toHaveAttribute('aria-disabled');
    const today = new Date();
    const monthsBack = today.getFullYear() * 12 + today.getMonth() - (BOUNDS.minValue.year * 12 + BOUNDS.minValue.month - 1);
    for (let back = 0; back < monthsBack; back += 1) {
      fireEvent.click(within(dialog).getByRole('button', { name: /previous/i }));
    }
    const beforeWindow = new Date(BOUNDS.minValue.year, BOUNDS.minValue.month - 1, BOUNDS.minValue.day - 1);
    expect(dayCell(beforeWindow)).toHaveAttribute('aria-disabled', 'true');
  });
});

// A jsdom helper suite: the key target is a DOM element.
describe('pressDraftDayByKey', () => {
  /** A day cell of today, the last pickable day. */
  const day = document.createElement('div');
  day.dataset.day = BOUNDS.maxValue.toString();
  /** A closed draft with no days. */
  const EMPTY = toRangeDraft(undefined);

  it('presses the day on Enter like a pointer, and leaves the draft on another key', () => {
    expect(pressDraftDayByKey(EMPTY, { key: 'Enter', repeat: false, target: day }, BOUNDS.minValue, BOUNDS.maxValue).anchorPending).toBe(true);
    expect(pressDraftDayByKey(EMPTY, { key: 'Tab', repeat: false, target: day }, BOUNDS.minValue, BOUNDS.maxValue)).toBe(EMPTY);
  });
});
