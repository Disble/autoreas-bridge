import { Button } from '@heroui/react';
import { ANIME_DETAIL_REPEAT_LABEL, ANIME_DETAIL_RESTORE_LABEL } from './anime-detail.constants';
import type { AnimeDetailMutationActionsProps } from './anime-detail.types';

/** Renders the eligible Repeat/Restore buttons; the hook owns eligibility and every side effect. */
export function AnimeDetailMutationActions(props: Readonly<AnimeDetailMutationActionsProps>) {
  return (
    <>
      {props.canRepeat ? (
        <Button isDisabled={props.isMutating} onPress={props.onRequestRepeat} size="sm" variant="primary">
          {ANIME_DETAIL_REPEAT_LABEL}
        </Button>
      ) : null}
      {props.canRestore ? (
        <Button isDisabled={props.isMutating} onPress={props.onRequestRestore} size="sm" variant="tertiary">
          {ANIME_DETAIL_RESTORE_LABEL}
        </Button>
      ) : null}
    </>
  );
}
