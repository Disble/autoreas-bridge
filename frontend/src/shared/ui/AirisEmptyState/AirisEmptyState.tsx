import { Button, Card, Typography } from '@heroui/react';
import { AIRIS_ARTWORK_CLASS, AIRIS_COMPACT_ARTWORK_CLASS } from './airis-empty-state.constants';
import type { AirisEmptyStateProps } from './airis-empty-state.types';
import { useAirisEmptyState } from './use-airis-empty-state';

/**
 * Renders a reusable, decorative empty-result shell while feature callers retain
 * ownership of their state classification, copy, and recovery behavior. The
 * `compact` size renders one row inside the host card instead of a card of its
 * own, with the same heading and muted description.
 */
export function AirisEmptyState({ imageSrc, title, description, action, size }: Readonly<AirisEmptyStateProps>) {
  const { hasArtwork, onArtworkError } = useAirisEmptyState();

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
