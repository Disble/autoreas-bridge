import type { ReactNode } from 'react';

/**
 * Props for the reusable labeled checkbox primitive.
 */
export interface LabeledCheckboxProps {
  readonly isSelected: boolean;
  readonly onChange: (isSelected: boolean) => void;
  readonly children: ReactNode;
  readonly className?: string;
  /** Shown but non-interactive when true (e.g. a row not yet eligible to pick). */
  readonly isDisabled?: boolean;
}
