export type ObservabilityPanelProps = Record<string, never>;

export interface ObservabilityLogEntry {
  readonly timestamp: string;
  readonly domain: string;
  readonly level?: string;
  readonly message: string;
}
