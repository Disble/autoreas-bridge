import { Button, Chip, Dropdown, Label } from '@heroui/react';
import { Icon } from '@iconify/react';
import closeIcon from '@iconify-icons/solar/close-circle-bold';
import alertIcon from '@iconify-icons/solar/danger-triangle-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_FAILURE_BUTTON_TOOLTIP, ACTIVITY_FAILURE_BUTTON_VARIANT, ACTIVITY_TYPE_ICONS } from './activity-toolbar.constants';
import type { ActivityFailureButtonProps } from './activity-toolbar.types';

/**
 * The failure button (activity-ui-design-v2.md, Failure button): a red pill
 * with the failures in scope that opens a menu of failure types. The menu
 * stays open while rows toggle, and the × beside the pill turns the filter off.
 */
export function ActivityFailureButton({ state, count, rows, selectedKeys, disabledKeys, onOpenChange, onSelectionChange, onClear }: ActivityFailureButtonProps) {
  return (
    <div className="flex items-center gap-1">
      <Dropdown isOpen={state === 'open'} onOpenChange={onOpenChange}>
        <Button aria-label={ACTIVITY_FAILURE_BUTTON_TOOLTIP[state]} aria-pressed={state !== 'off'} className="rounded-full" size="sm" variant={ACTIVITY_FAILURE_BUTTON_VARIANT[state]}>
          <Icon aria-hidden icon={alertIcon} />
          {count}
        </Button>
        <Dropdown.Popover placement="bottom end">
          <Label className="px-3 pt-2 text-sm">Failures</Label>
          <Dropdown.Menu
            aria-label="Failures by type"
            disabledKeys={disabledKeys}
            onSelectionChange={onSelectionChange}
            selectedKeys={selectedKeys}
            selectionMode="multiple"
            shouldCloseOnSelect={false}
          >
            {rows.map((row) => (
              <Dropdown.Item aria-label={`${row.label}, ${row.failed} failed`} id={row.type} key={row.type} textValue={row.label}>
                <Icon aria-hidden icon={ACTIVITY_TYPE_ICONS[row.type]} />
                <Label className="flex-1">{row.label}</Label>
                <Chip color={selectedKeys.has(row.type) ? 'danger' : 'default'} size="sm" variant="soft">
                  {row.failed}
                </Chip>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      {state === 'off' ? null : <IconActionButton ariaLabel="Turn off failure filter" icon={closeIcon} onPress={onClear} tooltip="Show all activity" />}
    </div>
  );
}
