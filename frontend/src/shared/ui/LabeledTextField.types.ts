import type { InputProps } from '@heroui/react';

/**
 * Props for the reusable labeled text field. The field is presentation-only: it
 * pairs a HeroUI Label + Input (+ optional Description) so every simple form row
 * shares one layout instead of repeating the Label/Input/Description block at
 * each call site.
 *
 * The interface combines the underlying HeroUI `Input` props (so every valid
 * HTML/Aria input attribute is still accepted and forwarded to the rendered
 * `<Input>`) with this component's unique contract: a required `label`, an
 * optional `description`, and a string-only `value`/`onChange`/`type` surface.
 * `onChange` receives the raw string value; callers that need a transform
 * (dates, numbers) do it themselves.
 */
export interface LabeledTextFieldProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type' | 'min' | 'placeholder'> {
  /** Text rendered inside the HeroUI Label. */
  readonly label: string;
  /** Current raw value of the input. */
  readonly value: string;
  /** Called with the raw string value whenever the input changes. */
  readonly onChange: (value: string) => void;
  /** Placeholder text for the empty input (forwarded to HeroUI Input). */
  readonly placeholder?: string;
  /** Optional helper text rendered via HeroUI Description. */
  readonly description?: string;
  /** Restricts the input to text, number, or date entry. */
  readonly type?: 'text' | 'number' | 'date';
  /** Numeric minimum for number/date inputs (forwarded to HeroUI Input). */
  readonly min?: number;
}
