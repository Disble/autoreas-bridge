import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CoverPlaceholderScene } from '../CoverPlaceholderScene';

describe('CoverPlaceholderScene', () => {
  afterEach(cleanup);

  it('renders an accessible placeholder illustration', () => {
    render(<CoverPlaceholderScene className="size-full" />);

    expect(screen.getByRole('img', { name: 'No cover art' })).toBeInTheDocument();
  });

  it('keeps props contracts in a colocated types file with a readonly boundary', () => {
    const componentPath = join(process.cwd(), 'src/shared/ui/CoverPlaceholderScene.tsx');
    const sourceText = readFileSync(componentPath, 'utf8');

    expect(sourceText).not.toMatch(/interface\s+CoverPlaceholderSceneProps\b/);
    expect(sourceText).toContain('Readonly<CoverPlaceholderSceneProps>');
  });
});
