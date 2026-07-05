import { z } from 'zod';

/** Runtime schema for externally supplied Chapters panel props. */
export const ChapterSchedulePanelSchema = z.object({
  initialDay: z.string().optional(),
});
