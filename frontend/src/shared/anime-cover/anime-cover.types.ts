import type { BridgeRuntimeSource } from '../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';

/**
 * The cover-resolution port a cover list depends on: the `getAnimeCover`
 * slice of `BridgeRuntimeSource`, so a test injects a fake without the Wails
 * singleton. Optional because a non-Wails context has no binding, which
 * degrades every row to the placeholder instead of throwing.
 */
export type AnimeCoverSource = Pick<BridgeRuntimeSource, 'getAnimeCover'>;

/** One cover-binding answer: a base64 data URL, or the explicit placeholder signal. */
export interface AnimeCoverResult {
  /** 'cover' when the binding found one; anything else means the placeholder. */
  readonly source: string;
  /** The cover as a data URL, when the binding returned one. */
  readonly dataUrl?: string;
}
