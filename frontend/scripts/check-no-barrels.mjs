#!/usr/bin/env node
// ADR-011 guard: no barrel files under src/.
//
// ESLint cannot catch a barrel that nothing imports yet, and a re-created
// index.ts resolves fine under moduleResolution "bundler" — so the only
// reliable check is the filesystem itself. Mirrors the deterministic-guard
// approach of tools/checkgofilesize on the Go side.
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');

/**
 * Collects every barrel file (index.ts / index.tsx) under a directory tree.
 * @param {string} dir Directory to scan.
 * @param {string[]} found Accumulator of absolute barrel paths.
 * @returns {string[]} All barrel paths found beneath `dir`.
 */
function collectBarrels(dir, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectBarrels(path, found);
    } else if (entry.name === 'index.ts' || entry.name === 'index.tsx') {
      found.push(path);
    }
  }
  return found;
}

const barrels = collectBarrels(SRC).map((p) => relative(join(SRC, '..'), p).split(sep).join('/'));

if (barrels.length > 0) {
  console.error(`Found ${barrels.length} barrel file(s) under src/. ADR-011 requires concrete-path imports.\n`);
  for (const barrel of barrels) {
    console.error(`  ${barrel}`);
  }
  console.error('\nDelete the barrel and import the concrete module file instead.');
  console.error('See docs/adr/011-no-barrel-files.md');
  process.exit(1);
}

console.log('No barrel files under src/ — ADR-011 satisfied.');
