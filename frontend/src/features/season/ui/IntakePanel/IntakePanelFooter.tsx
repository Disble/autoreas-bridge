import { Button } from '@heroui/react';
import type { IntakePanelFooterProps } from './intake-panel.types';

/**
 * IntakePanelFooter is the active intake's action row: Run matching, Check
 * availability and Create render only while they can act, followed by the row
 * counters. The panel leaves it out of the Discarded view. Presentation only.
 */
export function IntakePanelFooter(props: Readonly<IntakePanelFooterProps>) {
  const { readOnly, editableRowCount, availabilityPendingCount, availableCount, selectedCount } = props;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {!readOnly && (
        <>
          {editableRowCount === 0 ? null : (
            <Button variant="secondary" onPress={props.onRunMatching}>
              Run matching
            </Button>
          )}
          {availabilityPendingCount === 0 ? null : (
            <Button variant="secondary" onPress={props.onRecheckAvailability}>
              Check availability
            </Button>
          )}
          {availableCount === 0 && selectedCount === 0 ? null : (
            <Button isDisabled={selectedCount === 0} variant="primary" onPress={props.onCreate}>
              Create {selectedCount > 0 ? selectedCount : ''}
            </Button>
          )}
        </>
      )}
      {editableRowCount > 0 && (
        <span className="text-sm text-muted">
          {props.unresolvedCount} unresolved · {availabilityPendingCount} waiting · {availableCount} available to create
          {props.searchFailedCount > 0 ? ` · ${props.searchFailedCount} search failed` : null}
        </span>
      )}
    </div>
  );
}
