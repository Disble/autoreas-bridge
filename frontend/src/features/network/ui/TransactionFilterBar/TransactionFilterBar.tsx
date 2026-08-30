import { LabeledTextField } from '../../../../shared/ui/LabeledTextField';
import { TRANSACTION_STATUS_FILTER_PLACEHOLDER } from '../TransactionPanel/transaction-panel.constants';
import type { TransactionFilterBarProps } from '../TransactionPanel/transaction-panel.types';

/**
 * Dumb filter toolbar: Route / Outcome / Kind / Status labeled text fields,
 * every one of them forwarded to the backend query.
 *
 * There is deliberately no free-text search box and no status-class pill group
 * any more. Both used to narrow the rows already loaded, so a match one page
 * further down was unreachable however far the user paged; Status is now an
 * exact HTTP status, which is the status predicate the capture reader can
 * evaluate over the whole table.
 */
export function TransactionFilterBar({
  route,
  outcome,
  kind,
  status,
  onRouteChange,
  onOutcomeChange,
  onKindChange,
  onStatusChange,
}: Readonly<TransactionFilterBarProps>) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      <LabeledTextField label="Route" onChange={onRouteChange} placeholder="/api/animes/anime-1" value={route} />
      <LabeledTextField label="Outcome" onChange={onOutcomeChange} placeholder="accepted" value={outcome} />
      <LabeledTextField label="Kind" onChange={onKindChange} placeholder="patch" value={kind} />
      <LabeledTextField
        label="Status"
        onChange={onStatusChange}
        placeholder={TRANSACTION_STATUS_FILTER_PLACEHOLDER}
        value={status}
      />
    </div>
  );
}
