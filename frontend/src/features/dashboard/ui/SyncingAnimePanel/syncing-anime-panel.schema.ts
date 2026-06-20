import { z } from 'zod';

/** Reserved Zod schema for future panel configuration options. */
export const SyncingAnimePanelSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});
