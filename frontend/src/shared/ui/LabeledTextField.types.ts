/**
 * Props for the reusable labeled text field. The field is presentation-only: it
 * pairs a HeroUI Label + Input (+ optional Description) so every simple form row
 * shares one layout instead of repeating the Label/Input/Description block at
 * each call site. `onChange` receives the raw string value; callers that need a
 * transform (dates, numbers) do it themselves.
 */
export interface LabeledTextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly description?: string;
  readonly type?: 'text' | 'number' | 'date';
  readonly min?: number;
}
