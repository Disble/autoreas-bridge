import { Typography } from '@heroui/react';
import type { PageHeaderProps } from './page-header.types';

/**
 * Renders a screen's title row: the `h1`, an optional adornment beside it and
 * optional actions on the right, vertically centered in one wrapping row so the
 * title sits at the same place on every screen. There is deliberately no
 * subtitle slot. Presentation only: the caller owns the copy and the handlers.
 */
export function PageHeader({ actions, adornment, title, titleId }: Readonly<PageHeaderProps>) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Typography id={titleId} type="h1">{title}</Typography>
        {adornment}
      </div>
      {actions === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
