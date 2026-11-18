import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_LAYOUT_NAV_GROUPS } from '../../../shared/navigation/app-layout.constants';
import { flattenNavItems } from '../../../shared/navigation/app-layout.helpers';

/**
 * Reads the route paths declared in `App.tsx` in source order. The route table
 * is JSX rather than data, so the only way to assert on it without rendering
 * the whole shell is to read the declarations back out of the file — the same
 * approach the shared-UI suites already use to pin structural facts.
 */
function readDeclaredRoutePaths(): readonly string[] {
  const source = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');

  return [...source.matchAll(/path="([^"]+)"/g)].map((match) => match[1]);
}

describe('the Activity tabs', () => {
  it('adds no application route', () => {
    // Pinned as literals, not derived from the file it guards. Now, Incidents
    // and History are TABS inside Activity: a new route would also need a
    // ROUTE_MARKERS entry in the render smoke and a desktop-navigation spec
    // delta.
    expect(readDeclaredRoutePaths()).toEqual([
      '/today',
      '/episodes',
      '/dashboard',
      '/catalog',
      '/catalog/detail/:id',
      '/editor',
      // Before '/editor/:id' on purpose: react-router matches in declaration
      // order, so a static Create route listed after the identifier route would
      // be read as an anime called "create". This change ships its ROUTE_MARKERS
      // entry and its desktop-navigation spec delta.
      '/editor/create',
      '/editor/:id',
      '/history',
      '/downloads',
      '/devices',
      '/pairing',
      '/activity',
      '/events',
      '/network',
      '/status',
      '/season',
      '/notifications',
      '/settings',
      '/preferences',
      '*',
    ]);
  });

  it('adds no navigation entry', () => {
    expect(flattenNavItems(APP_LAYOUT_NAV_GROUPS).map((item) => item.to)).toEqual([
      '/today',
      '/downloads',
      '/editor',
      '/catalog',
      '/history',
      '/season',
      '/devices',
      '/activity',
      '/notifications',
      '/settings',
    ]);
  });

  it('are reachable only from inside Activity, never as their own destination', () => {
    const tabRoutes = readDeclaredRoutePaths().filter((path) => /^\/activity\/./.test(path));
    const tabNavEntries = flattenNavItems(APP_LAYOUT_NAV_GROUPS).filter((item) =>
      ['now', 'incidents'].includes(item.label.toLowerCase()),
    );

    expect(tabRoutes).toEqual([]);
    expect(tabNavEntries).toEqual([]);
  });
});
