import { useStore } from 'zustand';
import { downloadRuntimeStore } from './download-runtime-store.helpers';
import type { DownloadRuntimeStoreState } from './download-runtime-store.types';

/** Reads and subscribes to the Downloads runtime store, optionally through a selector. */
export function useDownloadRuntimeStore<T = DownloadRuntimeStoreState>(
  selector: (state: DownloadRuntimeStoreState) => T = ((state: DownloadRuntimeStoreState) => state as T),
): T {
  return useStore(downloadRuntimeStore, selector);
}
