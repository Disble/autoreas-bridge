import type { PickerSource } from '../../../../shared/contracts/picker.types';
import type { LibraryRootKept, LibraryRootMove, SettingsSource } from '../../../../shared/contracts/settings.types';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';

/** Props for the LibraryRootPanel; both ports are injectable for tests. */
export interface LibraryRootPanelProps {
  readonly source?: LibraryRootSource;
  /** The native folder picker Browse opens; `BRIDGE_PICKER_SOURCE` by default. */
  readonly pickerSource?: PickerSource;
}

/** The Settings port calls the panel makes: read and save the root, and preview its change. */
export type LibraryRootSource = Pick<SettingsSource, 'getLibraryRoot' | 'setLibraryRoot' | 'previewLibraryRootChange'>;

/** The one state the panel renders for the stored root: loading, failure or the root ('' when unset). */
export type LibraryRootView = AsyncView<string>;

/** A root change waiting for confirmation because active animes would move. */
export interface PendingLibraryRootChange {
  readonly oldRoot: string;
  readonly newRoot: string;
  readonly moves: readonly LibraryRootMove[];
  readonly kept: readonly LibraryRootKept[];
}

/** What a served preview leads to when the user saves a root. */
export type LibraryRootPreviewOutcome = { readonly kind: 'save' } | { readonly kind: 'confirm'; readonly pending: PendingLibraryRootChange };

/** Inputs of the root-change confirmation hook. */
export interface UseLibraryRootChangeOptions {
  readonly source: LibraryRootSource;
  readonly root: string;
  readonly persist: () => void;
  readonly fail: (message: string) => void;
}

/** Props for the confirmation modal of a pending root change. */
export interface LibraryRootChangeModalProps {
  readonly pendingChange: PendingLibraryRootChange | null;
  readonly count: number;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
