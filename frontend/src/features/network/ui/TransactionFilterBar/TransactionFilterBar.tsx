import { SearchField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import { TRANSACTION_FILTER_PLACEHOLDER, TRANSACTION_STATUS_CLASS_FILTER_OPTIONS } from '../TransactionPanel/transaction-panel.constants';
import type { TransactionFilterBarProps } from '../TransactionPanel/transaction-panel.types';

/**
 * Dumb filter toolbar: a free-text SearchField, Route/Outcome/Kind labeled
 * text fields (forwarded to the backend query), and a status-class
 * ToggleButtonGroup (client-side bucketing over the loaded page).
 */
export function TransactionFilterBar({
  route,
  outcome,
  kind,
  statusClass,
  query,
  onRouteChange,
  onOutcomeChange,
  onKindChange,
  onStatusClassChange,
  onQueryChange,
}: Readonly<TransactionFilterBarProps>) {
  return (
    <div className="flex flex-col gap-2.5">
      <SearchField aria-label="Filter captured transactions" fullWidth onChange={onQueryChange} value={query} variant="secondary">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={TRANSACTION_FILTER_PLACEHOLDER} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <LabeledTextField label="Route" onChange={onRouteChange} placeholder="/api/animes/anime-1" value={route} />
        <LabeledTextField label="Outcome" onChange={onOutcomeChange} placeholder="accepted" value={outcome} />
        <LabeledTextField label="Kind" onChange={onKindChange} placeholder="patch" value={kind} />
      </div>

      <ToggleButtonGroup
        aria-label="Filter by status class"
        disallowEmptySelection
        isDetached
        onSelectionChange={(keys) => {
          const [first] = keys;
          onStatusClassChange(String(first) as TransactionFilterBarProps['statusClass']);
        }}
        selectedKeys={[statusClass]}
        selectionMode="single"
        size="sm"
      >
        {TRANSACTION_STATUS_CLASS_FILTER_OPTIONS.map((option) => (
          <ToggleButton id={option.value} key={option.value}>
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}
