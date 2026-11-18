/**
 * Port of the native path pickers (ADR-032 §4), served by the always-ready
 * shell module (`PickFolder`, `PickFile`). The Wails adapter is
 * `createPickerSource` (`infrastructure/picker-source/picker-source.helpers.ts`),
 * exposed once as `BRIDGE_PICKER_SOURCE` in
 * `shared/query/bridge-runtime/bridge-runtime.constants.ts`.
 * `''` means the user cancelled the dialog; a failed dialog, or a binding that
 * never attaches, rejects with a `BridgeError` and is never read as a cancel.
 */
export interface PickerSource {
  /** Opens the native folder picker under `title`; resolves the chosen absolute path, or `''` on cancel. */
  readonly pickFolder: (title: string) => Promise<string>;
  /** Opens the native image-file picker under `title`; resolves the chosen absolute path, or `''` on cancel. */
  readonly pickFile: (title: string) => Promise<string>;
}
