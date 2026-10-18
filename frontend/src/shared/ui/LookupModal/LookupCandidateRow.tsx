import { Button, cn, Typography } from '@heroui/react';
import { RemoteCoverImage } from '../../anime-cover/RemoteCoverImage/RemoteCoverImage';
import { AnimeCoverPlaceholder } from '../AnimeCoverPlaceholder';
import { LOOKUP_CANDIDATE_COVER_SLOT_CLASS, LOOKUP_CANDIDATE_ROW_CLASS } from './lookup-modal.constants';
import type { LookupCandidateRowProps } from './lookup-modal.types';

/**
 * One selectable candidate row of a lookup modal: cover thumbnail, title, and
 * an optional muted subtitle. Pressing it only highlights it; the modal's
 * primary action is the sole path that applies a candidate.
 */
export function LookupCandidateRow({ title, subtitle, image, isSelected, onPress }: Readonly<LookupCandidateRowProps>) {
  return (
    <Button
      aria-pressed={isSelected}
      className={cn(LOOKUP_CANDIDATE_ROW_CLASS, isSelected ? 'border-accent bg-accent/10' : undefined)}
      variant="tertiary"
      onPress={onPress}
    >
      {/*
        The slot is what holds the box, never the artwork. Remote covers
        arrive at whatever aspect ratio each title has, so sizing the <img>
        itself let a wide cover render wider than a tall one and pushed every
        row's title to a different left edge. A fixed, `overflow-hidden` slot
        with `size-full object-cover` inside makes the source ratio unable to
        affect the row at all. The `width`/`height` attributes stay because
        they reserve the layout box before the remote image resolves, and keep
        it reserved if it never does -- measured in headless Edge via
        `loading-skeletons-fixture.tsx`, where a network-less <img> otherwise
        collapsed the row below its skeleton placeholder.
      */}
      <div className={LOOKUP_CANDIDATE_COVER_SLOT_CLASS}>
        {image === undefined ? (
          <AnimeCoverPlaceholder className="size-full text-muted" />
        ) : (
          <RemoteCoverImage
            className="size-full object-cover"
            fallback={<AnimeCoverPlaceholder className="size-full text-muted" />}
            height={40}
            src={image}
            width={40}
          />
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
        <Typography className="whitespace-normal break-words" type="body-sm" weight="semibold">
          {title}
        </Typography>
        {subtitle === '' ? null : (
          <Typography className="whitespace-normal break-words" color="muted" type="body-xs">
            {subtitle}
          </Typography>
        )}
      </div>
    </Button>
  );
}
