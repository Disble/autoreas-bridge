import { Description, Input, Label, TextField } from '@heroui/react';
import { HelpTooltip } from './HelpTooltip/HelpTooltip';
import { IconActionButton } from './IconActionButton/IconActionButton';
import type { PathPickerFieldProps } from './PathPickerField.types';

/**
 * Reusable filesystem-path field: an editable path input paired with an
 * icon-only trigger, named by its tooltip, that opens a native dialog. It is presentation-only — the caller's `onBrowse` decides
 * whether to open a folder or file dialog, so the same field serves anime
 * folders, cover images, and any future path picker without duplicating the
 * input-plus-button layout at each call site.
 */
export function PathPickerField({
  label,
  value,
  onChange,
  onBrowse,
  placeholder,
  description,
  browseIcon,
  browseLabel,
  mono,
  isDisabled,
  labelHelp,
  ...rest
}: Readonly<PathPickerFieldProps>) {
  return (
    <TextField>
      {labelHelp === undefined ? <Label>{label}</Label> : (
        <div className="flex items-center gap-1">
          <Label>{label}</Label>
          <HelpTooltip label={labelHelp.label} message={labelHelp.message} />
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          {...rest}
          className={mono === true ? 'font-mono' : undefined}
          disabled={isDisabled}
          fullWidth
          placeholder={placeholder}
          value={value}
          variant="secondary"
          onChange={(event) => onChange(event.target.value)}
        />
        {/* A field adornment is the quietest level: ghost, never louder than the actions around it. */}
        <IconActionButton ariaLabel={browseLabel} icon={browseIcon} isDisabled={isDisabled} tooltip={browseLabel} variant="ghost" onPress={onBrowse} />
      </div>
      {description !== undefined && <Description>{description}</Description>}
    </TextField>
  );
}
