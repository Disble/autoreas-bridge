import { useId } from 'react';
import { Skeleton } from '@heroui/react';
import type { LoadingBarsProps } from './loading-bars.types';

/** Default classes for a bar when the caller does not supply `barClassName`. */
const DEFAULT_BAR_CLASS_NAME = 'h-10 w-full rounded-lg';

/**
 * LoadingBars renders a stack of uniform placeholder bars behind a named
 * `status` region. Seven download and season surfaces used to render
 * byte-for-byte the same markup, announced only through a static
 * `<section aria-label>` a screen reader surfaces on landmark navigation
 * rather than when loading starts. Owning the status region here means an
 * adopting surface cannot render bars without also announcing them.
 *
 * `role="status"` takes its accessible name from the author, not from its
 * contents — ARIA's name-from-content allowlist excludes `status` — so the
 * region is named through `aria-labelledby` pointing at an `sr-only` span
 * rather than through the (text-less) `Skeleton` bars themselves. `useId`
 * keeps that id unique per instance, since several adopting surfaces render
 * side by side on the same route while all are loading.
 */
export function LoadingBars({ barClassName, className, count, label }: Readonly<LoadingBarsProps>) {
  const labelId = useId();
  const resolvedBarClassName = barClassName ?? DEFAULT_BAR_CLASS_NAME;

  return (
    <div aria-labelledby={labelId} aria-live="polite" className={className} role="status">
      <span className="sr-only" id={labelId}>
        {label}
      </span>
      {Array.from({ length: count }, (_unused, index) => (
        <Skeleton
          className={index === 0 ? resolvedBarClassName : `mt-2 ${resolvedBarClassName}`}
          data-testid="loading-bars-bar"
          key={index}
        />
      ))}
    </div>
  );
}
