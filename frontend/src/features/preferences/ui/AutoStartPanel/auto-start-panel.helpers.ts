/** Identifies the successful response returned by the desktop preference binding. */
export function isAutoStartSaved(status: string): boolean {
  return status === 'ok';
}
