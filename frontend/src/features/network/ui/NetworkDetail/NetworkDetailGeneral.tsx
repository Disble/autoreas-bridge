import type { NetworkDetailViewModel } from '../NetworkPanel/network-panel.types';

/** Dumb General tab: renders the selected entry's Fields section (label/value grid). */
export function NetworkDetailGeneral({ fields }: Readonly<Pick<NetworkDetailViewModel, 'fields'>>) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {fields.map(([key, value]) => (
        <div key={key}>
          <span className="block text-xs text-default-500">{key}</span>
          <span className="block break-all text-sm text-foreground">{value}</span>
        </div>
      ))}
    </div>
  );
}
