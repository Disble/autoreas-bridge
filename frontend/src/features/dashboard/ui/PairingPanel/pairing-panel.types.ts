export type PairingPanelProps = Record<string, never>;

export interface ParsedEffectiveAddress {
  readonly ip: string;
  readonly port: string;
}

export interface PairingQrPayloadInput {
  readonly ip: string;
  readonly port: string;
  readonly token: string;
}

export interface PairingQrImageOptions {
  readonly margin: number;
  readonly width: number;
}
