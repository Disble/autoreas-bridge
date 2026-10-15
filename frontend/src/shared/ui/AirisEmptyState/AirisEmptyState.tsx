import { Icon } from '@iconify/react';
import { Button, Card, Typography } from '@heroui/react';
import {
  AIRIS_ARTWORK_CLASS,
  AIRIS_CARD_CONTENT_CLASS,
  AIRIS_ICON_DISC_CLASS,
  AIRIS_ROW_ICON_DISC_CLASS,
  AIRIS_SECTION_SHELL_CLASS,
  AIRIS_SPLIT_CLASS,
  AIRIS_WAITING_ARTWORK_CLASS,
} from './airis-empty-state.constants';
import { getAirisEmptyStateActionVariant, getAirisEmptyStateIcon, resolveAirisEmptyStateKind } from './airis-empty-state.helpers';
import type { AirisEmptyStateAction, AirisEmptyStateKind, AirisEmptyStateProps } from './airis-empty-state.types';
import { useAirisEmptyState } from './use-airis-empty-state';

/**
 * Renders a reusable, decorative empty-result shell while feature callers keep
 * ownership of their state classification, copy, and recovery behavior.
 *
 * The `kind` says why the surface is empty and decides the artwork: the mascot
 * for `first-run` and `waiting-on-step`, an icon for `filtered` and
 * `caught-up`. The `size` says where it sits: its own card, a section of a wider
 * card, or one row. Card and section share one split layout whose artwork size
 * follows the container (docs/design/patterns/empty-states.md). A failed
 * artwork drops out and leaves the copy in its column.
 */
export function AirisEmptyState(props: Readonly<AirisEmptyStateProps>) {
  const { action, description, size, title } = props;
  const { hasArtwork, onArtworkError } = useAirisEmptyState();
  const kind = resolveAirisEmptyStateKind(props);
  const actionVariant = getAirisEmptyStateActionVariant(kind);

  if (size === 'row') {
    return (
      <div className="flex items-center gap-3">
        <span className={AIRIS_ROW_ICON_DISC_CLASS[kind]} data-airis-icon={kind}>
          <Icon aria-hidden="true" className="size-4" icon={getAirisEmptyStateIcon(kind)} />
        </span>
        <div className="flex min-w-0 flex-col">
          <Typography className="text-sm" type="h3">{title}</Typography>
          <Typography color="muted" type="body-sm">{description}</Typography>
        </div>
        {action === undefined ? null : <Button className="ml-auto" size="sm" variant={actionVariant} onPress={action.onPress}>{action.label}</Button>}
      </div>
    );
  }

  const split = (
    <div className={AIRIS_SPLIT_CLASS}>
      {props.imageSrc === undefined ? <AirisIconDisc kind={kind} /> : null}
      {props.imageSrc !== undefined && hasArtwork ? (
        <img
          alt=""
          aria-hidden="true"
          className={kind === 'waiting-on-step' ? AIRIS_WAITING_ARTWORK_CLASS : AIRIS_ARTWORK_CLASS}
          decoding="async"
          height={512}
          loading="eager"
          onError={onArtworkError}
          src={props.imageSrc}
          width={512}
        />
      ) : null}
      <AirisCopy action={action} actionVariant={actionVariant} description={description} title={title} />
    </div>
  );

  if (size === 'section') {
    return <div className={AIRIS_SECTION_SHELL_CLASS}>{split}</div>;
  }

  return (
    <Card>
      <Card.Content className={AIRIS_CARD_CONTENT_CLASS}>{split}</Card.Content>
    </Card>
  );
}

/** Props of the icon an icon kind shows where the mascot would sit. */
interface AirisIconDiscProps {
  /** The effective kind; only icon kinds reach here outside a row. */
  readonly kind: AirisEmptyStateKind;
}

/** The icon an icon kind shows in the split layout's artwork column. */
function AirisIconDisc({ kind }: AirisIconDiscProps) {
  const discClass = kind === 'caught-up' ? AIRIS_ICON_DISC_CLASS['caught-up'] : AIRIS_ICON_DISC_CLASS.filtered;
  return (
    <span className={discClass} data-airis-icon={kind}>
      <Icon aria-hidden="true" className="size-6" icon={getAirisEmptyStateIcon(kind)} />
    </span>
  );
}

/** Props of the copy column. */
interface AirisCopyProps {
  /** Visible concise explanation of the resolved empty result. */
  readonly title: string;
  /** Supporting guidance. */
  readonly description: string;
  /** Optional recovery action. */
  readonly action: AirisEmptyStateAction | undefined;
  /** The action's weight for this kind. */
  readonly actionVariant: 'primary' | 'secondary';
}

/**
 * The copy column, left-aligned beside (or under) the artwork. It is pinned to
 * the last track so a failed artwork leaves the copy where it was.
 */
function AirisCopy({ action, actionVariant, description, title }: AirisCopyProps) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 @xs:col-start-2">
      <Typography type="h3">{title}</Typography>
      <Typography className="max-w-xl" color="muted" type="body-sm">{description}</Typography>
      {action === undefined ? null : <Button className="mt-1" variant={actionVariant} onPress={action.onPress}>{action.label}</Button>}
    </div>
  );
}
