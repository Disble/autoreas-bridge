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

describe('the Activity Overview surface', () => {
  it('adds no application route', () => {
    // Pinned as literals, not derived from the file it guards. The Overview is
    // a TAB inside Activity: a new route would also need a ROUTE_MARKERS entry
    // in the render smoke and a desktop-navigation spec delta, neither of which
    // this change ships.
    expect(readDeclaredRoutePaths()).toEqual([
      '/today',
      '/episodes',
      '/dashboard',
      '/catalog',
      '/catalog/detail/:id',
      '/editor',
      '/editor/:id',
      '/history',
      '/downloads',
      '/devices',
      '/pairing',
      '/activity',
      '/activity/runtime-events',
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

  it('is reachable only from inside Activity, never as its own destination', () => {
    const overviewRoutes = readDeclaredRoutePaths().filter((path) => path.includes('overview'));
    const overviewNavEntries = flattenNavItems(APP_LAYOUT_NAV_GROUPS).filter((item) =>
      item.label.toLowerCase().includes('overview'),
    );

    expect(overviewRoutes).toEqual([]);
    expect(overviewNavEntries).toEqual([]);
  });
});
