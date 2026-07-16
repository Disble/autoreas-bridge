import { Button, Description, Input, Label, TextField } from '@heroui/react';
import type { PathPickerFieldProps } from './PathPickerField.types';

/**
 * Reusable filesystem-path field: an editable path input paired with a native
 * "Browse…" trigger. It is presentation-only — the caller's `onBrowse` decides
 * whether to open a folder or file dialog, so the same field serves anime
 * folders, cover images, and any future path picker without duplicating the
 * input-plus-button layout at each call site.
 */
export function PathPickerField(props: Readonly<PathPickerFieldProps>) {
  return (
    <TextField>
      <Label>{props.label}</Label>
      <div className="flex items-center gap-2">
        <Input
          className={props.mono === true ? 'font-mono' : undefined}
          fullWidth
          placeholder={props.placeholder}
          value={props.value}
          variant="secondary"
          onChange={(event) => props.onChange(event.target.value)}
        />
        <Button className="shrink-0" isDisabled={props.isDisabled} variant="secondary" onPress={props.onBrowse}>
          {props.browseLabel ?? 'Browse…'}
        </Button>
      </div>
      {props.description !== undefined && <Description>{props.description}</Description>}
    </TextField>
  );
}
