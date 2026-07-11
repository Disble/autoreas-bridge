/** Module-local runtime bridge state shared by the download runtime store helpers. */
export const DOWNLOAD_RUNTIME_STORE_RUNTIME_STATE: {
  runtimeUnsubscribe: (() => void) | null;
} = {
  runtimeUnsubscribe: null,
};
