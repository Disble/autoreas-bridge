import { Checkbox } from '@heroui/react';
import type { ReactNode } from 'react';

interface LabeledCheckboxProps {
  readonly isSelected: boolean;
  readonly onChange: (isSelected: boolean) => void;
  readonly children: ReactNode;
  readonly className?: string;
  /** Shown but non-interactive when true (e.g. a row not yet eligible to pick). */
  readonly isDisabled?: boolean;
}

/**
 * LabeledCheckbox wraps HeroUI v3's COMPOUND Checkbox with the required
 * Content/Control/Indicator structure and a visible off-state border. It exists
 * because a bare `<Checkbox>{label}</Checkbox>` renders no clickable box at all,
 * and the default field border is transparent (invisible on dark elevated cards).
 * When disabled it stays VISIBLE (a dimmed but present box) so a not-yet-eligible
 * row still shows its checkbox. Use this for any selectable list item.
 */
export function LabeledCheckbox({ isSelected, onChange, children, className, isDisabled }: LabeledCheckboxProps) {
  return (
    <Checkbox className={className} isDisabled={isDisabled} isSelected={isSelected} onChange={onChange}>
      <Checkbox.Content>
        <Checkbox.Control
          style={{ borderWidth: '1.5px', borderColor: 'var(--muted)', opacity: isDisabled ? 0.55 : 1 }}
        >
          <Checkbox.Indicator />
        </Checkbox.Control>
        {children}
      </Checkbox.Content>
    </Checkbox>
  );
}
