import type { JDStatus } from '../../../../shared/contracts/download.types';
import type { JDConfigFormFieldDescriptor } from './jdconfig-panel.types';

/** Safe default JD live-status shown before the first `getJDStatus` resolves. */
export const JDCONFIG_PANEL_EMPTY_STATUS: JDStatus = {
  email: '',
  hasPassword: false,
  deviceName: '',
  exePathOverride: '',
  defaultDestDir: '',
  lastSeenStatus: 'unknown',
  lastSeenAtMs: 0,
};

/** Ordered list of editable form rows rendered by `JDConfigPanel`. */
export const JDCONFIG_PANEL_FORM_FIELDS: readonly JDConfigFormFieldDescriptor[] = [
  { field: 'email', label: 'Email', type: 'text' },
  { field: 'plaintextPassword', label: 'Password', type: 'password' },
  { field: 'deviceName', label: 'Device name', type: 'text' },
  { field: 'exePathOverride', label: 'JDownloader executable path (optional)', type: 'text' },
  { field: 'defaultDestDir', label: 'Default destination folder', type: 'text' },
];
