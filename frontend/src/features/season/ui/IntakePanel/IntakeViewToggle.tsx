import { Chip, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { INTAKE_VIEW_TOGGLE_LABEL } from './intake-panel.constants';
import type { IntakeViewToggleProps } from './intake-panel.types';

/**
 * IntakeViewToggle switches List mode between the active intake and the
 * discarded rows, each option carrying its row count. The header renders it only
 * while some row is discarded. Presentation only: the hook narrows the key.
 */
export function IntakeViewToggle({ view, activeCount, discardedCount, onViewChange }: Readonly<IntakeViewToggleProps>) {
  return (
    <ToggleButtonGroup
      disallowEmptySelection
      aria-label={INTAKE_VIEW_TOGGLE_LABEL}
      selectedKeys={[view]}
      selectionMode="single"
      size="sm"
      onSelectionChange={(keys) => onViewChange(Array.from(keys)[0] ?? view)}
    >
      <ToggleButton id="active">
        Active
        <Chip size="sm" variant="soft"><Chip.Label>{activeCount}</Chip.Label></Chip>
      </ToggleButton>
      <ToggleButton id="discarded">
        Discarded
        <Chip size="sm" variant="soft"><Chip.Label>{discardedCount}</Chip.Label></Chip>
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
