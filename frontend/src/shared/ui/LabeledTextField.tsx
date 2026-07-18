import { Description, Input, Label, TextField } from '@heroui/react';
import type { LabeledTextFieldProps } from './LabeledTextField.types';

/**
 * Reusable labeled text field: a HeroUI Label + Input with an optional
 * Description. It is presentation-only and owns no state, so the same component
 * serves every simple editor row (name, page, duration, origin, …) without
 * repeating the Label/Input/Description layout. `onChange` forwards the raw
 * string value; the caller applies any date/number transform it needs.
 */
export function LabeledTextField(props: Readonly<LabeledTextFieldProps>) {
  const { label, min, placeholder, type, value, description, onChange, ...inputProps } = props;
  return (
    <TextField>
      <Label>{label}</Label>
      <Input
        fullWidth
        min={min}
        placeholder={placeholder}
        type={type ?? 'text'}
        value={value}
        variant="secondary"
        onChange={(event) => onChange(event.target.value)}
        {...inputProps}
      />
      {description !== undefined && <Description>{description}</Description>}
    </TextField>
  );
}
