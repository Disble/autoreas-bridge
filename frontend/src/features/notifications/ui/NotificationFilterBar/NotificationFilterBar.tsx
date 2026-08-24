import { Button, ButtonGroup, Card, ListBox, SearchField, Select } from '@heroui/react';
import { coerceLabeledSelectValues } from '../../../../shared/ui/LabeledSelect.helpers';
import {
  NOTIFICATION_LEVEL_FILTER_LABEL,
  NOTIFICATION_LEVEL_FILTER_PLACEHOLDER,
  NOTIFICATION_LEVEL_OPTIONS,
  NOTIFICATION_SOURCE_FILTER_LABEL,
  NOTIFICATION_SOURCE_FILTER_PLACEHOLDER,
  NOTIFICATION_VIEW_GROUP_LABEL,
  NOTIFICATION_VIEW_TABS,
} from './notification-filter-bar.constants';
import type { NotificationFilterBarProps, NotificationFilterOption } from './notification-filter-bar.types';

/**
 * Dumb toolbar for the notification master list: the four view tabs, the
 * free-text search box, and the level/source dropdowns beside them, as the
 * Main artboard draws them -- one row that wraps rather than a stack. The
 * search value it renders is already the raw (un-debounced) input; the
 * caller's `useNotificationFilters` hook is responsible for debouncing before
 * it reaches the backend query. `variant="secondary"` is flat/no-shadow,
 * correct for sitting inside a `Card` (design.md §9.2).
 *
 * The view strip is a `ButtonGroup` of four real `Button`s rather than the
 * single-select `ToggleButtonGroup` this repo uses for filter rows. That is
 * deliberate: a single-select `ToggleButtonGroup` renders a radiogroup, and a
 * radio reads as "narrow what is listed" -- which is exactly what the Levels
 * and Sources dropdowns beside it are. The strip is not that. Two of its
 * entries switch between the inbox and the archive, two lists with two
 * different bulk actions, so the whole strip is presented, and exposed to
 * assistive technology, as a group of pressable buttons.
 */
export function NotificationFilterBar({
  levels,
  onLevelsChange,
  onSearchInputChange,
  onSourcesChange,
  onViewChange,
  searchInput,
  sourceOptions,
  sources,
  view,
}: Readonly<NotificationFilterBarProps>) {
  return (
    <Card>
      <Card.Content className="flex flex-row flex-wrap items-center gap-3">
        <SearchField.Root
          aria-label="Search notifications"
          className="min-w-60 flex-1"
          onChange={onSearchInputChange}
          value={searchInput}
          variant="secondary"
        >
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search notifications..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField.Root>
        <ButtonGroup aria-label={NOTIFICATION_VIEW_GROUP_LABEL} size="sm">
          {NOTIFICATION_VIEW_TABS.map((tab) => (
            <Button
              aria-pressed={view === tab.view}
              key={tab.view}
              onPress={() => onViewChange(tab.view)}
              variant={view === tab.view ? 'primary' : 'tertiary'}
            >
              {tab.label}
            </Button>
          ))}
        </ButtonGroup>
        <NotificationFilterSelect
          ariaLabel={NOTIFICATION_LEVEL_FILTER_LABEL}
          onChange={onLevelsChange}
          options={NOTIFICATION_LEVEL_OPTIONS}
          placeholder={NOTIFICATION_LEVEL_FILTER_PLACEHOLDER}
          value={levels}
        />
        <NotificationFilterSelect
          ariaLabel={NOTIFICATION_SOURCE_FILTER_LABEL}
          onChange={onSourcesChange}
          options={sourceOptions}
          placeholder={NOTIFICATION_SOURCE_FILTER_PLACEHOLDER}
          value={sources}
        />
      </Card.Content>
    </Card>
  );
}

/**
 * One multi-select filter dropdown, composed exactly as `shared/ui`'s
 * `LabeledSelect` composes its own `Select`/`ListBox` scaffold, minus the
 * visible `Label` that wrapper always renders: the artboard draws these two
 * as bare 36px controls in the filter row, named only by the value they show
 * ("All levels"), so the accessible name comes from `aria-label` instead.
 * Its value coercion IS reused, so the `Key | Key[] | null` React Aria hands
 * back is narrowed to strings in exactly one place in the app.
 *
 * Multi-select rather than single: the backend takes an `IN (...)` set for
 * both filters, and an empty set means "no filter applied", never "match
 * nothing" -- so clearing the last chosen value is what restores the
 * unfiltered list.
 */
function NotificationFilterSelect({
  ariaLabel,
  onChange,
  options,
  placeholder,
  value,
}: Readonly<{
  ariaLabel: string;
  onChange: (values: readonly string[]) => void;
  options: readonly NotificationFilterOption[];
  placeholder: string;
  value: readonly string[];
}>) {
  return (
    <Select
      aria-label={ariaLabel}
      className="w-40"
      onChange={(selected) => onChange(coerceLabeledSelectValues(selected))}
      placeholder={placeholder}
      selectionMode="multiple"
      value={[...value]}
      variant="secondary"
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox selectionMode="multiple">
          {options.map((option) => (
            <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
