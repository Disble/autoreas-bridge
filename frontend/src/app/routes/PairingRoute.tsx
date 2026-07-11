import { PairingPanel } from '../../features/dashboard/ui/PairingPanel/PairingPanel';

/**
 * PairingRoute renders the focused device-pairing flow within the app shell.
 */
export function PairingRoute() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PairingPanel />
    </div>
  );
}
