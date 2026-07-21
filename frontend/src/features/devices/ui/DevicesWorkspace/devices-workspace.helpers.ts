/**
 * Tells the Devices page whether a reconcile response should render feedback.
 * This keeps the render branch explicit and out of the delivery/component layer.
 */
export function hasSyncResult(syncResult: string) {
  return syncResult.length > 0;
}
