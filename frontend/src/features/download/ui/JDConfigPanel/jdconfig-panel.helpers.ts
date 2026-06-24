import type { JDConfigInput, JDStatus } from '../../../../shared/contracts/download.types';
import type { JDConfigFormValues } from './jdconfig-panel.types';

/**
 * Maps the live `JDStatus` read-model to the editable form's initial values.
 * `plaintextPassword` is ALWAYS the empty string here — the password is
 * write-only and is never echoed back from the backend, even when
 * `hasPassword` is true.
 */
export function toJDConfigFormValues(status: JDStatus): JDConfigFormValues {
  return {
    email: status.email,
    plaintextPassword: '',
    deviceName: status.deviceName,
    exePathOverride: status.exePathOverride,
    defaultDestDir: status.defaultDestDir,
  };
}

/**
 * Maps the form values to the `SetJDConfig` write request. `plaintextPassword`
 * is omitted entirely (not sent as an empty string) when the user leaves the
 * password field blank, so the backend keeps the existing encrypted
 * credential untouched.
 */
export function toJDConfigInput(form: JDConfigFormValues): JDConfigInput {
  return {
    email: form.email,
    plaintextPassword: form.plaintextPassword === '' ? undefined : form.plaintextPassword,
    deviceName: form.deviceName,
    exePathOverride: form.exePathOverride,
    defaultDestDir: form.defaultDestDir,
  };
}
