import { z } from 'zod';

/** Zod schema for validating SeasonModePanel input data. */
export const SeasonModePanelSchema = z.object({
  className: z.string().optional(),
});
