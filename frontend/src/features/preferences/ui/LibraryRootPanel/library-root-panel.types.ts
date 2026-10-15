import type {
  LibraryRootChangePreview,
  LibraryRootKept,
  LibraryRootMove,
} from '../../../../infrastructure/preferences-source/preferences-source.types';

/** Props for the LibraryRootPanel; source is injectable for tests. */
export interface LibraryRootPanelProps {
  readonly source?: LibraryRootSource;
}

/** Runtime source used by the panel to read/persist the root, preview its change, and pick a folder. */
export interface LibraryRootSource {
  readonly getLibraryRoot: () => Promise<string>;
  readonly setLibraryRoot: (path: string) => Promise<string>;
  readonly previewLibraryRootChange: (path: string) => Promise<LibraryRootChangePreview>;
  readonly pickFolder: (title: string) => Promise<string>;
}

/** A root change waiting for confirmation because active animes would move. */
export interface PendingLibraryRootChange {
  readonly oldRoot: string;
  readonly newRoot: string;
  readonly moves: readonly LibraryRootMove[];
  readonly kept: readonly LibraryRootKept[];
}

/** What a served preview leads to when the user saves a root. */
export type LibraryRootPreviewOutcome =
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'save' }
  | { readonly kind: 'confirm'; readonly pending: PendingLibraryRootChange };

/** Inputs of the root-change confirmation hook. */
export interface UseLibraryRootChangeOptions {
  readonly source: LibraryRootSource;
  readonly root: string;
  readonly persist: () => Promise<void>;
  readonly fail: (message: string) => void;
  readonly setIsSaving: (isSaving: boolean) => void;
}

/** Props for the confirmation modal of a pending root change. */
export interface LibraryRootChangeModalProps {
  readonly pendingChange: PendingLibraryRootChange | null;
  readonly count: number;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}
