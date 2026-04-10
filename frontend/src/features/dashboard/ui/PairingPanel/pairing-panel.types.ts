import type { ComponentType, SVGProps } from 'react';

export type PairingPanelProps = Record<string, never>;

export interface ParsedEffectiveAddress {
  readonly ip: string;
  readonly port: string;
}

export interface PairingQrCodeProps extends SVGProps<SVGSVGElement> {
  readonly value: string;
  readonly size?: number;
}

export type PairingQrCodeComponent = ComponentType<PairingQrCodeProps>;

export interface PairingQrCodeModule {
  readonly default?: PairingQrCodeComponent;
  readonly QRCode?: PairingQrCodeComponent;
}
