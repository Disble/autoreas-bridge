import copyIcon from '@iconify-icons/solar/copy-bold-duotone';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import type { ActivityCopyForAiButtonProps } from './activity-run-story.types';

/** "Copy for AI": an icon-only secondary action with the Copy glyph, whose tooltip names what it copies. */
export function ActivityCopyForAiButton({ label, onCopy }: Readonly<ActivityCopyForAiButtonProps>) {
  const name = `Copy ${label} for AI`;
  return <IconActionButton ariaLabel={name} icon={copyIcon} tone="accent" tooltip={name} onPress={onCopy} />;
}
