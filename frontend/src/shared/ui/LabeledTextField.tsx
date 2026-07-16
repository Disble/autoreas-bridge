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
  return (
    <TextField>
      <Label>{props.label}</Label>
      <Input
        fullWidth
        min={props.min}
        placeholder={props.placeholder}
        type={props.type ?? 'text'}
        value={props.value}
        variant="secondary"
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.description !== undefined && <Description>{props.description}</Description>}
    </TextField>
  );
}
