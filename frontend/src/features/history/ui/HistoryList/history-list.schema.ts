import { z } from 'zod';

/**
 * Zod schema for a single repetition-history entry as consumed by History.
 * All `fecha*` millis are optional -- a legacy `null` date degrades to
 * absent, never to a validation failure (mirrors `anime-detail.schema.ts`'s
 * `animeRepeticionSchema`, duplicated per this repo's feature-colocation
 * convention rather than a cross-feature import).
 */
export const historyRepeticionSchema = z.object({
  numrepeticion: z.number(),
  nrocapvisto: z.number(),
  estado: z.number(),
  fechaCreacion: z.number().optional(),
  fechaEstreno: z.number().optional(),
  fechaUltCapVisto: z.number().optional(),
  fechaEliminacion: z.number().optional(),
  fechaRepeticion: z.number().optional(),
});

/**
 * Zod schema for the merged `HistoryCandidate` shape used to decide History
 * membership and build a card.
 */
export const historyCandidateSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  nrocapvisto: z.number(),
  totalcap: z.number().optional(),
  repetir: z.array(historyRepeticionSchema).optional(),
});
