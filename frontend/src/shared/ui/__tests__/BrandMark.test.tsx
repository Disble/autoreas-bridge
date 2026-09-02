import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BrandMark } from '../BrandMark';

/** Reads the rendered root `<svg>`, which the mark exposes decoratively. */
function renderMark(className?: string): SVGSVGElement {
  const { container } = render(<BrandMark className={className} />);
  const svg = container.querySelector('svg');
  if (!svg) {
    throw new Error('BrandMark rendered no <svg>');
  }
  return svg;
}

describe('BrandMark', () => {
  afterEach(cleanup);

  it('inherits its colour from the surrounding text colour', () => {
    // The mark ships in one colour and is recoloured by its slot -- white on
    // the rail, brand blue on light chrome. A hardcoded fill would freeze it.
    const svg = renderMark();

    expect(svg.getAttribute('fill')).toBe('currentColor');
  });

  it('fills the counter of the A with the background rather than ink', () => {
    // Without evenodd the traced hole renders solid and the glyph reads as a
    // filled triangle instead of an A.
    const path = renderMark().querySelector('path');

    expect(path?.getAttribute('fill-rule')).toBe('evenodd');
  });

  it('keeps the traced aspect ratio so a square slot cannot squash it', () => {
    const svg = renderMark();

    const [minX, minY, width, height] = (svg.getAttribute('viewBox') ?? '').split(' ').map(Number);
    expect([minX, minY]).toEqual([0, 0]);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(width);
    // `meet` is the SVG default; `slice` would crop the tips off in a square box.
    expect(svg.getAttribute('preserveAspectRatio')).not.toBe('xMidYMid slice');
  });

  it('is decorative, because every slot already labels the app in text beside it', () => {
    const svg = renderMark();

    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
  });

  it('applies the caller class so the slot controls the size', () => {
    expect(renderMark('size-5').getAttribute('class')).toBe('size-5');
  });

  it('keeps props contracts in a colocated types file with a readonly boundary', () => {
    const componentPath = join(process.cwd(), 'src/shared/ui/BrandMark.tsx');
    const sourceText = readFileSync(componentPath, 'utf8');

    expect(sourceText).not.toMatch(/interface\s+BrandMarkProps\b/);
    expect(sourceText).toContain('Readonly<BrandMarkProps>');
  });
});
