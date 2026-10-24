import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import alertIcon from '@iconify-icons/solar/danger-circle-bold';
import { ICON_ACTION_TOOLTIP_DELAY_MS } from '../../../../shared/ui/IconActionButton/icon-action-button.constants';
import { ACTIVITY_FAILURE_CLASSES, ACTIVITY_FAILURE_SWITCH_LABEL, ACTIVITY_FAILURE_SWITCH_TOOLTIP } from './activity-toolbar.constants';
import type { ActivityFailureButtonProps } from './activity-toolbar.types';

/**
 * The failure switch (activity-ui-design-v2.md, Failure button; S12 M1): a red
 * pill with the failures of the selected types. Off it reads soft red; on it
 * reads solid red and the feed shows only those failures. Its tooltip says
 * what the next press does.
 */
export function ActivityFailureButton({ isOn, count, onToggle }: ActivityFailureButtonProps) {
  return (
    <Tooltip delay={ICON_ACTION_TOOLTIP_DELAY_MS}>
      <Button
        aria-label={ACTIVITY_FAILURE_SWITCH_LABEL}
        aria-pressed={isOn}
        className={`${ACTIVITY_FAILURE_CLASSES.pill} flex-none ${isOn ? '' : ACTIVITY_FAILURE_CLASSES.pillSoft}`}
        onPress={onToggle}
        variant={isOn ? 'danger' : 'danger-soft'}
      >
        <Icon aria-hidden className="size-4" icon={alertIcon} />
        {count}
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {ACTIVITY_FAILURE_SWITCH_TOOLTIP[isOn ? 'on' : 'off']}
      </Tooltip.Content>
    </Tooltip>
  );
}
