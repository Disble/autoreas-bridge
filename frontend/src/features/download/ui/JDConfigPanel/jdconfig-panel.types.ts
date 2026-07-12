/** Props for the `JDConfigPanel` dumb-UI component. */
export interface JDConfigPanelProps {
  readonly className?: string;
}

/** The editable form fields. `plaintextPassword` is write-only: always starts empty, never pre-filled from `JDStatus`. */
export interface JDConfigFormValues {
  readonly email: string;
  readonly plaintextPassword: string;
  readonly deviceName: string;
  readonly exePathOverride: string;
  readonly defaultDestDir: string;
}

/** Describes one rendered form row: which field it edits, its label, and its input type. */
export interface JDConfigFormFieldDescriptor {
  readonly field: keyof JDConfigFormValues;
  readonly label: string;
  readonly type: 'text' | 'password';
}
