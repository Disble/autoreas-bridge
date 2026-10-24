import { Button, Chip, Label, Menu } from '@heroui/react';
import { Icon } from '@iconify/react';
import closeIcon from '@iconify-icons/tabler/x';
import alertIcon from '@iconify-icons/solar/danger-circle-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import {
  ACTIVITY_FAILURE_BUTTON_TOOLTIP,
  ACTIVITY_FAILURE_BUTTON_VARIANT,
  ACTIVITY_FAILURE_MENU_ID,
  ACTIVITY_FAILURE_PILL_CLASS,
  ACTIVITY_FAILURE_PILL_SOFT_CLASS,
  ACTIVITY_FAILURE_POPOVER_CLASS,
  ACTIVITY_FAILURE_POPOVER_STATE_CLASS,
  ACTIVITY_FAILURE_ROW_CLASS,
  ACTIVITY_FAILURE_X_CLASS,
  ACTIVITY_TYPE_ICONS,
} from './activity-toolbar.constants';
import type { ActivityFailureButtonProps } from './activity-toolbar.types';

/**
 * The failure button (activity-ui-design-v2.md, Failure button; S12 M1): a
 * red pill with the failures in scope and, while the filter is on, an × inside
 * its right end. Its menu is always mounted behind the pill and grows out of
 * it by clip-path, so the pill stays on top as the right end of the menu's
 * header row, with "Failures" on the left. Rows toggle without closing it.
 */
export function ActivityFailureButton({ state, count, rows, selectedKeys, disabledKeys, groupRef, onToggle, onSelectionChange, onClear }: ActivityFailureButtonProps) {
  return (
    <div className="relative flex-none" data-activity-failure-group={state} ref={groupRef}>
      <Button
        aria-controls={ACTIVITY_FAILURE_MENU_ID}
        aria-expanded={state === 'open'}
        aria-haspopup="menu"
        aria-label={ACTIVITY_FAILURE_BUTTON_TOOLTIP[state]}
        aria-pressed={state !== 'off'}
        className={`${ACTIVITY_FAILURE_PILL_CLASS} ${state === 'off' ? 'pr-3' : 'pr-9'} ${state === 'on' ? '' : ACTIVITY_FAILURE_PILL_SOFT_CLASS}`}
        data-failure-pill
        onPress={onToggle}
        variant={ACTIVITY_FAILURE_BUTTON_VARIANT[state]}
      >
        <Icon aria-hidden className="size-4" icon={alertIcon} />
        {count}
      </Button>
      {state === 'off' ? null : (
        <span className={ACTIVITY_FAILURE_X_CLASS}>
          <IconActionButton
            ariaLabel="Turn off failure filter"
            icon={closeIcon}
            isTinted={state === 'open'}
            onPress={onClear}
            tone="danger"
            tooltip="Show all activity"
            variant="ghost"
          />
        </span>
      )}
      <div
        aria-hidden={state !== 'open'}
        className={`${ACTIVITY_FAILURE_POPOVER_CLASS} ${ACTIVITY_FAILURE_POPOVER_STATE_CLASS[state === 'open' ? 'open' : 'closed']}`}
        data-failure-popover={state === 'open' ? 'open' : 'closed'}
        inert={state !== 'open'}
      >
        <span aria-hidden className="absolute left-4 top-1.5 flex h-9 items-center text-[13px] font-semibold text-muted">
          Failures
        </span>
        <Menu
          aria-label="Failures by type"
          className="flex flex-col gap-0.5 p-0"
          disabledKeys={disabledKeys}
          id={ACTIVITY_FAILURE_MENU_ID}
          onSelectionChange={onSelectionChange}
          selectedKeys={selectedKeys}
          selectionMode="multiple"
        >
          {rows.map((row) => (
            <Menu.Item aria-label={`${row.label}, ${row.failed} failed`} className={ACTIVITY_FAILURE_ROW_CLASS} id={row.type} key={row.type} textValue={row.label}>
              <Icon aria-hidden className="size-4 shrink-0 text-muted group-data-[selected=true]:text-foreground" icon={ACTIVITY_TYPE_ICONS[row.type]} />
              <Label className="flex-1 text-inherit">{row.label}</Label>
              <Chip color={selectedKeys.has(row.type) ? 'danger' : 'default'} size="sm" variant="soft">
                {row.failed}
              </Chip>
            </Menu.Item>
          ))}
        </Menu>
      </div>
    </div>
  );
}
