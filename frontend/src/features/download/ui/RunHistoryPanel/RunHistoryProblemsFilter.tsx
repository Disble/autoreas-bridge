import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import alertIcon from '@iconify-icons/solar/danger-circle-bold';
import closeIcon from '@iconify-icons/tabler/x';
import { RUN_HISTORY_PROBLEMS_TOOLTIP } from './run-history-panel.constants';
import type { RunHistoryProblemsFilterProps } from './run-history-panel.types';

/**
 * The Problems filter: an alert icon and the count of problem runs, with no
 * text label, the same grammar as Activity's failure button. While it is on
 * the pill darkens and shows an × at its end; its tooltip names what the next
 * press does.
 */
export function RunHistoryProblemsFilter({ count, isOn, onToggle }: Readonly<RunHistoryProblemsFilterProps>) {
  const tooltip = isOn ? RUN_HISTORY_PROBLEMS_TOOLTIP.on : RUN_HISTORY_PROBLEMS_TOOLTIP.off;

  return (
    <Tooltip delay={300}>
      <Tooltip.Trigger className="inline-flex shrink-0 rounded-full" role="presentation" tabIndex={-1}>
        <Button
          aria-label={isOn ? `Showing ${count} runs with problems. Show all runs` : `Show only the ${count} runs with problems`}
          aria-pressed={isOn}
          className={`h-8 gap-1.5 rounded-full px-3 text-[13px] font-medium tabular-nums ${isOn ? 'bg-default-hover' : ''}`}
          size="sm"
          variant="tertiary"
          onPress={onToggle}
        >
          <Icon aria-hidden="true" className="size-4 text-danger" icon={alertIcon} />
          {count}
          {isOn ? <Icon aria-hidden="true" className="size-4 text-muted" icon={closeIcon} /> : null}
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}
