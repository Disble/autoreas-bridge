import type { IconifyIcon } from '@iconify/react';
import type { InputProps } from '@heroui/react';
import type { HelpTooltipProps } from './HelpTooltip/help-tooltip.types';

/**
 * Props for the reusable filesystem path picker field. The field is
 * presentation-only: the caller supplies `onBrowse`, so the same component
 * serves folder pickers, cover-image file pickers, and any future path input.
 *
 * The interface combines the underlying HeroUI `Input` props (so every valid
 * HTML/Aria input attribute is still accepted and forwarded to the rendered
 * `<Input>`) with this component's unique contract: a required `label`, the
 * `onBrowse`/`browseIcon`/`browseLabel` icon-only trigger, a `mono` flag for monospace path
 * rendering, an `isDisabled` that gates both the input and the Browse button,
 * and an optional helper `description`. `onChange` receives the raw string
 * value.
 */
export interface PathPickerFieldProps
  extends Omit<InputProps, 'value' | 'onChange' | 'placeholder' | 'isDisabled' | 'className'> {
  /** Text rendered inside the HeroUI Label. */
  readonly label: string;
  /** Current raw value of the path input. */
  readonly value: string;
  /** Called with the raw string value whenever the input changes. */
  readonly onChange: (value: string) => void;
  /** Opens the native folder/file dialog. Decides folder vs file dialog. */
  readonly onBrowse: () => void;
  /** Placeholder text for the empty input (forwarded to HeroUI Input). */
  readonly placeholder?: string;
  /** Optional helper text rendered via HeroUI Description. */
  readonly description?: string;
  /** The icon of the icon-only trigger: a folder for a folder picker, a picture for an image file. */
  readonly browseIcon: IconifyIcon;
  /** The trigger's accessible name and tooltip, verb first ("Choose folder"). */
  readonly browseLabel: string;
  /** When true, renders the input with a monospace font. */
  readonly mono?: boolean;
  /** Disables both the input and the Browse button when true. */
  readonly isDisabled?: boolean;
  /** Optional "(?)" help beside the label, explaining what the field does and does not do. */
  readonly labelHelp?: HelpTooltipProps;
}
