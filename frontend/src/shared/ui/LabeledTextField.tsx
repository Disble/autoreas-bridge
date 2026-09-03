import { Description, FieldError, Input, Label, TextField } from '@heroui/react';
import type { LabeledTextFieldProps } from './LabeledTextField.types';

/**
 * Reusable labeled text field: a HeroUI Label + Input with an optional
 * Description. It is presentation-only and owns no state, so the same component
 * serves every simple editor row (name, page, duration, origin, …) without
 * repeating the Label/Input/Description layout. `onChange` forwards the raw
 * string value; the caller applies any date/number transform it needs.
 *
 * A rejection is rendered through HeroUI's own FieldError, which shows itself
 * only while the parent TextField is marked invalid — so the visibility is the
 * component library's, not a conditional of ours.
 */
export function LabeledTextField(props: Readonly<LabeledTextFieldProps>) {
  const { label, min, placeholder, type, value, description, errorMessage, onChange, ...inputProps } = props;
  const isRejected = errorMessage !== undefined;
  return (
    <TextField isInvalid={isRejected}>
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
      <FieldError>{errorMessage}</FieldError>
      {description !== undefined && <Description>{description}</Description>}
    </TextField>
  );
}
