import { z } from 'zod';

/** Zod schema for the `CatalogLens` union -- no wire DTO is involved; this
 * exists to validate a lens value read from an external source (e.g. a
 * future persisted preference) should one ever be added. */
export const catalogLensSchema = z.union([z.literal('catalog'), z.literal('history')]);
