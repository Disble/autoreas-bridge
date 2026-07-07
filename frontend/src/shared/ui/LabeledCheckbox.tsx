import { Checkbox } from '@heroui/react';
import type { ReactNode } from 'react';

interface LabeledCheckboxProps {
  readonly isSelected: boolean;
  readonly onChange: (isSelected: boolean) => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * LabeledCheckbox wraps HeroUI v3's COMPOUND Checkbox with the required
 * Content/Control/Indicator structure and a visible off-state border. It exists
 * because a bare `<Checkbox>{label}</Checkbox>` renders no clickable box at all,
 * and the default field border is transparent (invisible on dark elevated cards).
 * Use this for any selectable list item so those two gotchas never recur.
 */
export function LabeledCheckbox({ isSelected, onChange, children, className }: LabeledCheckboxProps) {
  return (
    <Checkbox className={className} isSelected={isSelected} onChange={onChange}>
      <Checkbox.Content>
        <Checkbox.Control style={{ borderWidth: '1.5px', borderColor: 'var(--muted)' }}>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {children}
      </Checkbox.Content>
    </Checkbox>
  );
}
