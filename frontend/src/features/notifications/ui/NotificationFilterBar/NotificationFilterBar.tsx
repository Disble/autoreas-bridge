import { Button, ButtonGroup, Card, SearchField } from '@heroui/react';
import type { NotificationFilterBarProps } from './notification-filter-bar.types';

/**
 * Dumb toolbar for the notification master list: the active/archived view
 * switcher above the free-text search box. The search value it renders is
 * already the raw (un-debounced) input; the caller's `useNotificationFilters`
 * hook is responsible for debouncing before it reaches the backend query.
 * `variant="secondary"` is flat/no-shadow, correct for sitting inside a
 * `Card` (design.md §9.2).
 *
 * The view switcher is a `ButtonGroup` of two real `Button`s rather than the
 * single-select `ToggleButtonGroup` this repo uses for filter rows. That is
 * deliberate: a single-select `ToggleButtonGroup` renders a radiogroup, and
 * a radio reads as "narrow what is listed" -- which is what the Sources and
 * Levels filters beside it will be. Switching between the inbox and the
 * archive is a navigation between two lists with two different bulk actions,
 * so it is presented, and exposed to assistive technology, as a pair of
 * pressable buttons.
 */
export function NotificationFilterBar({ onSearchInputChange, onViewChange, searchInput, view }: Readonly<NotificationFilterBarProps>) {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-3">
        <ButtonGroup aria-label="Notification view" className="self-start" size="sm">
          <Button aria-pressed={view === 'active'} onPress={() => onViewChange('active')} variant={view === 'active' ? 'primary' : 'tertiary'}>
            Active
          </Button>
          <Button
            aria-pressed={view === 'archived'}
            onPress={() => onViewChange('archived')}
            variant={view === 'archived' ? 'primary' : 'tertiary'}
          >
            Archived
          </Button>
        </ButtonGroup>
        <SearchField.Root aria-label="Search notifications" fullWidth onChange={onSearchInputChange} value={searchInput} variant="secondary">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search notifications..." />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField.Root>
      </Card.Content>
    </Card>
  );
}
