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
