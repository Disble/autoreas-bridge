import archiveUpIcon from '@iconify-icons/solar/archive-up-linear';
import backIcon from '@iconify-icons/solar/alt-arrow-left-linear';
import penIcon from '@iconify-icons/solar/pen-linear';
import rewindBackIcon from '@iconify-icons/solar/rewind-back-linear';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import {
  ANIME_DETAIL_BACK_LABEL,
  ANIME_DETAIL_BACK_TOOLTIP,
  ANIME_DETAIL_EDIT_TOOLTIP,
  ANIME_DETAIL_REPEAT_LABEL,
  ANIME_DETAIL_RESTORE_LABEL,
} from './anime-detail.constants';
import type { AnimeDetailToolbarProps } from './anime-detail.types';

/**
 * The main card's toolbar: Back on the left, the actions on the right as
 * icon-only buttons. Conditional actions sit to the left of Edit, so Edit,
 * the one that is always there, never moves. A running mutation disables
 * every action, Edit included.
 */
export function AnimeDetailToolbar({ detail, isMutating, onBack, onEditAnime, onRequestRepeat, onRequestRestore }: Readonly<AnimeDetailToolbarProps>) {
  return (
    <div className="-mx-2 -mt-1 flex items-center justify-between gap-2">
      <IconActionButton ariaLabel={ANIME_DETAIL_BACK_LABEL} icon={backIcon} tooltip={ANIME_DETAIL_BACK_TOOLTIP} variant="ghost" onPress={onBack} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {detail.canRepeat ? (
          <IconActionButton ariaLabel={detail.repeatLabel} icon={rewindBackIcon} isDisabled={isMutating} tooltip={ANIME_DETAIL_REPEAT_LABEL} variant="tertiary" onPress={onRequestRepeat} />
        ) : null}
        {detail.canRestore ? (
          <IconActionButton ariaLabel={detail.restoreLabel} icon={archiveUpIcon} isDisabled={isMutating} tooltip={ANIME_DETAIL_RESTORE_LABEL} variant="tertiary" onPress={onRequestRestore} />
        ) : null}
        <IconActionButton ariaLabel={detail.editLabel} icon={penIcon} isDisabled={isMutating} tooltip={ANIME_DETAIL_EDIT_TOOLTIP} variant="tertiary" onPress={onEditAnime} />
      </div>
    </div>
  );
}
