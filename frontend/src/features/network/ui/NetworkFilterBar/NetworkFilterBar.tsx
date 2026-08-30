import { SearchField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import {
  NETWORK_FILTER_PLACEHOLDER,
  NETWORK_LEVEL_FILTER_OPTIONS,
} from '../NetworkPanel/network-panel.constants';
import type {
  NetworkFilterBarProps,
  NetworkLevelFilter,
} from '../NetworkPanel/network-panel.types';

/** Dumb compact toolbar: free-text SearchField plus DOMAIN and LEVEL ToggleButtonGroup rows. The domain options are derived from the store's own aggregate and arrive as props — this component enumerates nothing. */
export function NetworkFilterBar({
  query,
  levelFilter,
  domainFilter,
  domainOptions,
  onQueryChange,
  onLevelFilterChange,
  onDomainFilterChange,
}: Readonly<NetworkFilterBarProps>) {
  return (
    <div className="flex flex-col gap-2.5">
      <SearchField aria-label="Filter runtime events" fullWidth onChange={onQueryChange} value={query} variant="secondary">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={NETWORK_FILTER_PLACEHOLDER} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <ToggleButtonGroup
        aria-label="Filter by domain"
        disallowEmptySelection
        isDetached
        onSelectionChange={(keys) => {
          const [first] = keys;
          onDomainFilterChange(`${first}`);
        }}
        selectedKeys={[domainFilter]}
        selectionMode="single"
        size="sm"
      >
        {domainOptions.map((option) => (
          <ToggleButton id={option.value} key={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <ToggleButtonGroup
        aria-label="Filter by level"
        disallowEmptySelection
        isDetached
        onSelectionChange={(keys) => {
          const [first] = keys;
          onLevelFilterChange(String(first) as NetworkLevelFilter);
        }}
        selectedKeys={[levelFilter]}
        selectionMode="single"
        size="sm"
      >
        {NETWORK_LEVEL_FILTER_OPTIONS.map((option) => (
          <ToggleButton id={option.value} key={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
