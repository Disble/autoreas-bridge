import { z } from 'zod';

/**
 * Zod schema for a runtime Anime DTO. Used to validate raw runtime payloads
 * before they are mapped to the view model.
 */
export const animeSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  estado: z.number(),
  nrocapvisto: z.number(),
  totalcap: z.number().optional(),
  activo: z.number(),
});
