import { PickFile, PickFolder } from '../../../wailsjs/go/desktop/App';
import type { PickerSource } from '../../shared/contracts/picker.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { invokeGoBinding } from '../wails-bindings.helpers';

/**
 * Calls one picker binding: its rejection becomes a `BridgeError`, and a
 * binding that never attaches rejects as `unavailable` instead of answering a
 * cancel.
 * @param bindingName The `App` method name, as `window.go` exposes it.
 * @param call The generated binding call.
 * @returns The chosen path, or `''` when the user cancelled.
 */
function callPickerBinding(bindingName: string, call: () => Promise<string>): Promise<string> {
  return withBridgeErrors(
    invokeGoBinding(bindingName, call, () => Promise.reject(createBridgeError('unavailable', `the ${bindingName} binding is not attached`))),
  );
}

/**
 * The Wails adapter of the `PickerSource` port (ADR-032 §4), built once in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`. A cancelled
 * dialog resolves `''`; a failed one rejects with the shell's `internal`
 * failure, so the UI can tell the two apart.
 * @returns The source.
 */
export function createPickerSource(): PickerSource {
  return {
    pickFolder: (title) => callPickerBinding('PickFolder', () => PickFolder(title)),
    pickFile: (title) => callPickerBinding('PickFile', () => PickFile(title)),
  };
}
