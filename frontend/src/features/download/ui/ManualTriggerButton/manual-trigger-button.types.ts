/** Props for the `ManualTriggerButton` dumb-UI component. */
export interface ManualTriggerButtonProps {
  readonly className?: string;
}

/** Idle/triggering/already-in-progress/error/success states for the manual trigger action. */
export type ManualTriggerButtonStatus = 'idle' | 'triggering' | 'already-in-progress' | 'error' | 'success';

/** View model returned by `useManualTriggerButton`. */
export interface ManualTriggerButtonViewModel {
  readonly status: ManualTriggerButtonStatus;
  readonly errorMessage?: string;
}

/** Result of mapping `TriggerDownloadCheck`'s raw response string to a typed outcome. */
export interface ManualTriggerResult {
  readonly status: 'success' | 'already-in-progress' | 'error';
  readonly errorMessage?: string;
}
