import { Button } from '@heroui/react';
import { IntakeCheckTime } from './IntakeCheckTime/IntakeCheckTime';
import { IntakeViewToggle } from './IntakeViewToggle';
import type { IntakePanelHeaderProps } from './intake-panel.types';

/**
 * IntakePanelHeader is the intake card's title row: "Intake list", the Active /
 * Discarded toggle while List mode has discarded rows, and the check-time and
 * Raw / List controls of an editable season. A read-only season shows the title only.
 */
export function IntakePanelHeader(props: Readonly<IntakePanelHeaderProps>) {
  const { readOnly, mode, switchMode } = props;
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-foreground">Intake list</h3>
        {!readOnly && mode === 'list' && props.discardedCount > 0 && (
          <IntakeViewToggle
            activeCount={props.activeCount}
            discardedCount={props.discardedCount}
            view={props.view}
            onViewChange={props.onViewChange}
          />
        )}
      </div>
      {!readOnly && (
        <div className="flex items-center gap-1">
          <IntakeCheckTime />
          <Button size="sm" variant={mode === 'raw' ? 'primary' : 'tertiary'} onPress={() => switchMode('raw')}>
            Raw
          </Button>
          <Button size="sm" variant={mode === 'list' ? 'primary' : 'tertiary'} onPress={() => switchMode('list')}>
            List
          </Button>
        </div>
      )}
    </div>
  );
}
