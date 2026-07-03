import { z } from 'zod';

/**
 * Zod schema for a single repetition-history entry returned by
 * `GetAnimeDetail`. All `fecha*` millis are optional — a legacy `null` date
 * degrades to absent, never to a validation failure.
 */
export const animeRepeticionSchema = z.object({
  numrepeticion: z.number(),
  nrocapvisto: z.number(),
  estado: z.number(),
  fechaCreacion: z.number().optional(),
  fechaEstreno: z.number().optional(),
  fechaUltCapVisto: z.number().optional(),
  fechaEliminacion: z.number().optional(),
  fechaRepeticion: z.number().optional(),
});
