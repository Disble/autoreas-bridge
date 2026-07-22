import { z } from 'zod';

/**
 * Zod schema for a runtime Anime DTO. Used to validate raw runtime payloads
 * before they are mapped to the view model.
 */
export const animeSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.number(),
  episodesWatched: z.number(),
  totalEpisodes: z.number().optional(),
  active: z.number(),
  kind: z.number().optional(),
  days: z.array(z.string()).default([]),
  genres: z.array(z.string()).default([]),
  hasDownloadPage: z.boolean().default(false),
  hasFolder: z.boolean().default(false),
});
