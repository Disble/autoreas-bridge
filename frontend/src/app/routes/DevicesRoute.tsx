import { DevicesWorkspace } from '../../features/devices/ui/DevicesWorkspace/DevicesWorkspace';

/**
 * DevicesRoute renders the Devices workspace within the delivery-layer
 * route shell. This is the relocated destination for the removed Dashboard
 * and Pairing routes.
 */
export function DevicesRoute() {
  return <DevicesWorkspace />;
}
