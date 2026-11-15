import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';

/** Host and port parsed out of the backend's effective address string. */
export interface ParsedEffectiveAddress {
  readonly ip: string;
  readonly port: string;
}

/** Inputs needed to build the QR payload a mobile client scans to pair. */
export interface PairingQrPayloadInput {
  readonly ip: string;
  readonly port: string;
  readonly token: string;
}

/** Rendering options (margin, size) for the generated pairing QR image. */
export interface PairingQrImageOptions {
  readonly margin: number;
  readonly width: number;
}

/** The address and token the panel shows, and the failure that hides them. */
export interface PairingPanelReadings {
  /** The bound `host:port`, or '' while it loads or after it failed. */
  readonly address: string;
  /** The live token, or '' while it loads, refreshes after being consumed, or failed. */
  readonly token: string;
  /** Why the address or the token could not be read; '' when neither failed. */
  readonly failureMessage: string;
}

/** The views of the two pairing reads, as `toAsyncView` returns them. */
export interface PairingPanelViews {
  readonly address: AsyncView<string>;
  readonly token: AsyncView<string>;
}
