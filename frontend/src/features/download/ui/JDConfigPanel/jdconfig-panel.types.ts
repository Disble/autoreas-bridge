import type { JDStatus } from '../../../../shared/contracts/download.types';

/** Props for the `JDConfigPanel` dumb-UI component. */
export interface JDConfigPanelProps {
  readonly className?: string;
}

/** Loading/error/ready states for the JD config form (2026 quality bar). */
export type JDConfigPanelStatus = 'loading' | 'error' | 'ready';

/** The editable form fields. `plaintextPassword` is write-only: always starts empty, never pre-filled from `JDStatus`. */
export interface JDConfigFormValues {
  readonly email: string;
  readonly plaintextPassword: string;
  readonly deviceName: string;
  readonly exePathOverride: string;
  readonly defaultDestDir: string;
}

/** Aggregate view model returned by `useJDConfigPanel`. */
export interface JDConfigPanelViewModel {
  readonly status: JDConfigPanelStatus;
  readonly form: JDConfigFormValues;
  readonly liveStatus: JDStatus;
  readonly isSaving: boolean;
  readonly saveErrorMessage?: string;
  readonly saveSucceeded: boolean;
}

/** Describes one rendered form row: which field it edits, its label, and its input type. */
export interface JDConfigFormFieldDescriptor {
  readonly field: keyof JDConfigFormValues;
  readonly label: string;
  readonly type: 'text' | 'password';
}
