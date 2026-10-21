// fallow-ignore-file unused-file

import { describe, expect, it } from 'vitest';
import { validateAssetDetails } from '../check-airis-assets.mjs';

// The real ffprobe + ffmpeg decode of the checked-in artwork runs as the
// `airis-assets` lefthook job, not here: spawning both binaries inside the
// parallel coverage run timed out under load.
describe('validateAssetDetails', () => {
  it('rejects opaque and wrong-codec inspection results', () => {
    expect(validateAssetDetails('opaque.webp', { codec: 'webp', width: 512, height: 512, alphaBytes: Buffer.alloc(4, 255) })).toEqual([
      'opaque.webp: expected at least one transparent pixel',
    ]);
    expect(validateAssetDetails('wrong-codec.webp', { codec: 'png', width: 512, height: 512, alphaBytes: Buffer.from([0]) })).toEqual([
      'wrong-codec.webp: expected codec webp, got png',
    ]);
  });
});
