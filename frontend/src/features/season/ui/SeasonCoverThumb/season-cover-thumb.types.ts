import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';

/**
 * What a season row's 44px cover slot renders: a resolved image source, a
 * pending lookup, or (neither) the shared placeholder. The slot never resolves
 * anything itself, so a caller decides where the source comes from.
 */
export interface SeasonCoverThumbProps {
  /** A renderable image source (a resolved data URL); absent means no cover. */
  readonly coverSrc: string | undefined;
  /** Whether the cover is still being resolved; ignored once a source exists. */
  readonly isLoading: boolean;
}

/**
 * The cover-resolution port a season list depends on: the `getAnimeCover`
 * slice of `BridgeRuntimeSource`, so a test injects a fake without the Wails
 * singleton. Optional because a non-Wails context has no binding, which
 * degrades every row to the placeholder instead of throwing.
 */
export type SeasonCoverSource = Pick<BridgeRuntimeSource, 'getAnimeCover'>;

/** One cover-binding answer: a base64 data URL, or the explicit placeholder signal. */
export interface SeasonCoverResult {
  /** 'cover' when the binding found one; anything else means the placeholder. */
  readonly source: string;
  /** The cover as a data URL, when the binding returned one. */
  readonly dataUrl?: string;
}
