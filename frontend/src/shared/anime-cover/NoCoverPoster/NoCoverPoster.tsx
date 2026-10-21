import { Chip } from '@heroui/react';
import noCoverPoster from '../../../assets/covers/no-cover.webp';
import type { NoCoverPosterProps } from './no-cover-poster.types';

/**
 * The approved Airis "No Cover" poster, cropped like a real cover so it fills
 * whatever frame holds it edge to edge. The label pill is UI, never part of
 * the art, and only shows where the frame is large enough to carry it.
 */
export function NoCoverPoster({ label, labelClassName = 'bottom-2 left-2', showLabel }: Readonly<NoCoverPosterProps>) {
  return (
    <span className="relative block size-full bg-surface-secondary">
      <img alt={label} className="size-full object-cover" decoding="async" src={noCoverPoster} />
      {showLabel ? (
        <Chip aria-hidden="true" className={`absolute bg-background/75 text-foreground ${labelClassName}`} color="default" size="sm" variant="soft">
          <Chip.Label>{label}</Chip.Label>
        </Chip>
      ) : null}
    </span>
  );
}
