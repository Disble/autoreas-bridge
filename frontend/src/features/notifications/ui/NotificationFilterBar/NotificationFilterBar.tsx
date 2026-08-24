import { Card, SearchField } from '@heroui/react';
import type { NotificationFilterBarProps } from './notification-filter-bar.types';

/**
 * Dumb free-text search toolbar for the notification master list. The value
 * it renders is already the raw (un-debounced) input; the caller's
 * `useNotificationFilters` hook is responsible for debouncing before it
 * reaches the backend query. `variant="secondary"` is flat/no-shadow,
 * correct for sitting inside a `Card` (design.md §9.2).
 */
export function NotificationFilterBar({ onSearchInputChange, searchInput }: Readonly<NotificationFilterBarProps>) {
  return (
    <Card>
      <Card.Content>
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
