import { z } from 'zod';

/** Runtime schema for externally supplied Episodes panel props. */
export const EpisodeSchedulePanelSchema = z.object({
  initialDay: z.string().optional(),
});
