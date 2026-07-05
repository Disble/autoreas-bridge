import { z } from 'zod';

/** Runtime schema for optional ConnectedDevicesPanel dependency injection. */
export const ConnectedDevicesPanelSchema = z.object({
  source: z.unknown().optional(),
});
