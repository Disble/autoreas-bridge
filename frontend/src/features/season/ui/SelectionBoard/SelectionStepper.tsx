import { Button } from '@heroui/react';

/** The values and edits one numeric stepper renders. */
interface SelectionStepperProps {
  /** The visible field label. */
  readonly label: string;
  /** The current value. */
  readonly value: number;
  /** Accessible name of the decrement action. */
  readonly decreaseLabel: string;
  /** Accessible name of the increment action. */
  readonly increaseLabel: string;
  /** Whether the decrement action is unavailable at the lower bound or read-only season. */
  readonly canDecrease: boolean;
  /** Whether the increment action is unavailable at the upper bound or read-only season. */
  readonly canIncrease: boolean;
  /** Applies value - 1. */
  readonly onDecrease: () => void;
  /** Applies value + 1. */
  readonly onIncrease: () => void;
}

/**
 * SelectionStepper is one labelled numeric stepper of the decision header: a
 * muted field label over a −/+ pair around the current value. The bounds and
 * the read-only season arrive as disable flags, so the control never edits
 * outside what the steam accepts.
 */
export function SelectionStepper({
  label,
  value,
  decreaseLabel,
  increaseLabel,
  canDecrease,
  canIncrease,
  onDecrease,
  onIncrease,
}: Readonly<SelectionStepperProps>) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <Button aria-label={decreaseLabel} isDisabled={!canDecrease} size="sm" variant="secondary" onPress={onDecrease}>
          −
        </Button>
        <span className="w-6 text-center text-sm font-semibold text-foreground">{value}</span>
        <Button aria-label={increaseLabel} isDisabled={!canIncrease} size="sm" variant="secondary" onPress={onIncrease}>
          +
        </Button>
      </div>
    </div>
  );
}
