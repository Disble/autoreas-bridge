import { Button, Card, Typography } from '@heroui/react';
import { AIRIS_ARTWORK_CLASS, AIRIS_COMPACT_ARTWORK_CLASS, AIRIS_INLINE_ARTWORK_CLASS, AIRIS_INLINE_SHELL_CLASS } from './airis-empty-state.constants';
import type { AirisEmptyStateProps } from './airis-empty-state.types';
import { useAirisEmptyState } from './use-airis-empty-state';

/**
 * Renders a reusable, decorative empty-result shell while feature callers retain
 * ownership of their state classification, copy, and recovery behavior. The
 * `compact` size renders one row inside the host card instead of a card of its
 * own, with the same heading and muted description. The `inline` size puts the
 * 128px artwork on the left and the copy plus one action on the right, for an
 * empty state that fills a section of a wider card. Its copy column is pinned to
 * the second track so a failed artwork leaves the copy where it was.
 */
export function AirisEmptyState({ imageSrc, title, description, action, size }: Readonly<AirisEmptyStateProps>) {
  const { hasArtwork, onArtworkError } = useAirisEmptyState();

  if (size === 'inline') {
    return (
      <div className={AIRIS_INLINE_SHELL_CLASS}>
        {hasArtwork ? (
          <img alt="" aria-hidden="true" className={AIRIS_INLINE_ARTWORK_CLASS} decoding="async" height={512} loading="eager" onError={onArtworkError} src={imageSrc} width={512} />
        ) : null}
        <div className="col-start-2 flex min-w-0 flex-col items-start gap-2">
          <Typography type="h3">{title}</Typography>
          <Typography color="muted" type="body-sm">{description}</Typography>
          {action === undefined ? null : <Button className="mt-1" variant="primary" onPress={action.onPress}>{action.label}</Button>}
        </div>
      </div>
    );
  }

  if (size === 'compact') {
    return (
      <div className="flex items-center gap-3">
        {hasArtwork ? (
          <img alt="" aria-hidden="true" className={AIRIS_COMPACT_ARTWORK_CLASS} decoding="async" height={512} loading="eager" onError={onArtworkError} src={imageSrc} width={512} />
        ) : null}
        <div className="flex min-w-0 flex-col">
          <Typography className="text-sm" type="h3">{title}</Typography>
          <Typography color="muted" type="body-sm">{description}</Typography>
        </div>
        {action === undefined ? null : <Button className="ml-auto" size="sm" variant="primary" onPress={action.onPress}>{action.label}</Button>}
      </div>
    );
  }

  return (
    <Card>
      <Card.Content className="flex flex-col items-center gap-4 text-center">
        {hasArtwork ? (
          <img alt="" aria-hidden="true" className={AIRIS_ARTWORK_CLASS} decoding="async" height={512} loading="eager" onError={onArtworkError} src={imageSrc} width={512} />
        ) : null}
        <div className="flex max-w-xl flex-col gap-2">
          <Typography type="h3">{title}</Typography>
          <Typography color="muted" type="body">{description}</Typography>
        </div>
        {action === undefined ? null : <Button variant="primary" onPress={action.onPress}>{action.label}</Button>}
      </Card.Content>
    </Card>
  );
}
