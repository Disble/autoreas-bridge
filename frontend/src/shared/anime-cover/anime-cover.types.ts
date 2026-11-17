import type { AnimeCoverResult, AnimeSource } from '../contracts/anime-source.types';

/**
 * The cover-resolution port a cover list depends on: the `getAnimeCover` read
 * of `AnimeSource`, so a test injects a fake without the Wails singleton.
 * Optional because a non-Wails context has no binding, which degrades every
 * row to the placeholder instead of throwing.
 */
export type AnimeCoverSource = Partial<Pick<AnimeSource, 'getAnimeCover'>>;
