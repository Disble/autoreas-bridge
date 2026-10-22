import starIcon from '@iconify-icons/solar/star-bold-duotone';
import { Button } from '@heroui/react';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { CHANGE_GRADE_LABEL } from './rate-anime-modal.constants';
import { formatGradeLabel } from './rate-anime-modal.helpers';
import type { RateAnimeModalTriggerProps } from './rate-anime-modal.types';

/**
 * The button that opens the grade modal. The enclosing `Modal` treats whichever
 * Button renders here as its own trigger, so no variant needs a press handler.
 * 'grade' is the Episodes card's tertiary button showing the current grade,
 * 'rate' is an ungraded row's secondary "Rate" button, and 'icon' is a round
 * tertiary star named and tooltipped "Change grade" for a rated or skipped row.
 */
export function RateAnimeModalTrigger({ variant, rawName, currentGrade }: Readonly<RateAnimeModalTriggerProps>) {
  if (variant === 'icon') {
    return <IconActionButton ariaLabel={`${CHANGE_GRADE_LABEL} for ${rawName}`} icon={starIcon} tone="warning" tooltip={CHANGE_GRADE_LABEL} />;
  }
  if (variant === 'rate') {
    return (
      <Button aria-label={`Rate ${rawName}`} size="sm" variant="secondary">
        Rate
      </Button>
    );
  }
  return (
    <Button aria-label={`Rate ${rawName}`} className="hover:text-accent" size="sm" variant="tertiary">
      {currentGrade >= 1 ? `Grade ${formatGradeLabel(currentGrade)}` : 'Rate'}
    </Button>
  );
}
