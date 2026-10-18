import { Button, Tooltip } from '@heroui/react';
import { Icon } from '@iconify/react';
import magicIcon from '@iconify-icons/solar/magic-stick-3-bold-duotone';
import type { ActivityCopyForAiButtonProps } from './activity-run-story.types';

/** "Copy for AI": an icon-only secondary action whose tooltip names what it copies. */
export function ActivityCopyForAiButton({ label, onCopy }: ActivityCopyForAiButtonProps) {
  return (
    <Tooltip delay={0}>
      <Button aria-label={`Copy ${label} for AI`} className="shrink-0" isIconOnly onPress={onCopy} size="sm" variant="secondary">
        <Icon aria-hidden icon={magicIcon} />
      </Button>
      <Tooltip.Content>Copy {label} for AI</Tooltip.Content>
    </Tooltip>
  );
}
