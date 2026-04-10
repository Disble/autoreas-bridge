export type PairingPanelProps = Record<string, never>;

export interface ParsedEffectiveAddress {
  readonly ip: string;
  readonly port: string;
}

export interface PairingQrImageOptions {
  readonly margin: number;
  readonly width: number;
}
