import magicStickIcon from '@iconify-icons/solar/magic-stick-3-bold-duotone';
import { Icon } from '@iconify/react';
import { Button, Tooltip } from '@heroui/react';
import { METADATA_LOOKUP_TRIGGER_LABEL } from './anime-metadata-lookup.constants';
import type { AnimeMetadataLookupTriggerProps } from './anime-metadata-lookup.types';

/**
 * The button that opens the MyAnimeList lookup modal. The enclosing `Modal`
 * treats whichever Button renders here as its own trigger, so neither variant
 * needs a press handler. The text variant is the form's visible action; the
 * icon variant is a round tertiary button named and tooltipped with the same
 * label, for a row's action group.
 */
export function AnimeMetadataLookupTrigger({ variant, isDisabled }: Readonly<AnimeMetadataLookupTriggerProps>) {
  if (variant === 'text') {
    return (
      <Button isDisabled={isDisabled} variant="tertiary">
        {METADATA_LOOKUP_TRIGGER_LABEL}
      </Button>
    );
  }
  return (
    <Tooltip>
      <Button
        isIconOnly
        aria-label={METADATA_LOOKUP_TRIGGER_LABEL}
        className="hover:text-accent"
        isDisabled={isDisabled}
        size="sm"
        variant="tertiary"
      >
        <Icon className="size-4" icon={magicStickIcon} />
      </Button>
      <Tooltip.Content showArrow>
        <Tooltip.Arrow />
        {METADATA_LOOKUP_TRIGGER_LABEL}
      </Tooltip.Content>
    </Tooltip>
  );
}
