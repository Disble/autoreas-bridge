import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import alertIcon from '@iconify-icons/solar/danger-circle-bold';
import { ICON_ACTION_TOOLTIP_DELAY_MS } from '../../../../shared/ui/IconActionButton/icon-action-button.constants';
import { RUN_HISTORY_PROBLEMS_CLASSES, RUN_HISTORY_PROBLEMS_TOOLTIP } from './run-history-panel.constants';
import type { RunHistoryProblemsFilterProps } from './run-history-panel.types';

/**
 * The Problems filter: an alert icon and the count of problem runs, with no
 * text label, styled as Activity's failure button. Off it reads soft red; on
 * it reads solid red and the list shows only the problem runs. Its tooltip
 * names what the next press does.
 */
export function RunHistoryProblemsFilter({ count, isOn, onToggle }: Readonly<RunHistoryProblemsFilterProps>) {
  const tooltip = isOn ? RUN_HISTORY_PROBLEMS_TOOLTIP.on : RUN_HISTORY_PROBLEMS_TOOLTIP.off;

  return (
    <Tooltip delay={ICON_ACTION_TOOLTIP_DELAY_MS}>
      <Tooltip.Trigger className="inline-flex shrink-0 rounded-full" role="presentation" tabIndex={-1}>
        <Button
          aria-label={isOn ? `Showing ${count} runs with problems. Show all runs` : `Show only the ${count} runs with problems`}
          aria-pressed={isOn}
          className={`${RUN_HISTORY_PROBLEMS_CLASSES.pill} ${isOn ? '' : RUN_HISTORY_PROBLEMS_CLASSES.pillSoft}`}
          size="sm"
          variant={isOn ? 'danger' : 'danger-soft'}
          onPress={onToggle}
        >
          <Icon aria-hidden="true" className="size-4" icon={alertIcon} />
          {count}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
