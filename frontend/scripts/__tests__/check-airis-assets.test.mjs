// fallow-ignore-file unused-file

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { validateAirisAsset, validateAssetDetails } from '../check-airis-assets.mjs';

/** Resolves paths from this test file to the frontend package root. */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('validateAirisAsset', () => {
  it('accepts the checked-in transparent 512px WebP asset', () => {
    expect(validateAirisAsset(path.join(frontendRoot, 'src', 'assets', 'airis-empty-states', 'today.webp'))).toEqual([]);
  });

  it('rejects opaque and wrong-codec inspection results', () => {
    expect(validateAssetDetails('opaque.webp', { codec: 'webp', width: 512, height: 512, alphaBytes: Buffer.alloc(4, 255) })).toEqual([
      'opaque.webp: expected at least one transparent pixel',
    ]);
    expect(validateAssetDetails('wrong-codec.webp', { codec: 'png', width: 512, height: 512, alphaBytes: Buffer.from([0]) })).toEqual([
      'wrong-codec.webp: expected codec webp, got png',
    ]);
  });
});
