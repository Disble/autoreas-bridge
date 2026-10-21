import type { ReactNode } from 'react';

/** Props for the shared page header every routed screen renders above its content. */
export interface PageHeaderProps {
  /** The page title, rendered as the screen's only `h1`; it matches the nav label. */
  readonly title: string;
  /** Optional id on the `h1`, for a surrounding region's `aria-labelledby`. */
  readonly titleId?: string;
  /** Optional inline content right after the title, such as a status chip. */
  readonly adornment?: ReactNode;
  /** Optional right-aligned controls on the same row, such as the screen's primary action. */
  readonly actions?: ReactNode;
}
