/**
 * Props for the reusable filesystem path picker field. The field is
 * presentation-only: the caller supplies `onBrowse`, so the same component
 * serves folder pickers, cover-image file pickers, and any future path input.
 */
export interface PathPickerFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBrowse: () => void;
  readonly placeholder?: string;
  readonly description?: string;
  readonly browseLabel?: string;
  readonly mono?: boolean;
  readonly isDisabled?: boolean;
}
