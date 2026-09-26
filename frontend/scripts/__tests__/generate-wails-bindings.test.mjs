import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ensureEmbedTarget,
  missingBindings,
  requiredBindings,
} from '../generate-wails-bindings.mjs';

/**
 * Creates an empty throwaway project root that the caller fills selectively,
 * so each case controls exactly which binding files exist.
 */
function makeRoot() {
  return mkdtempSync(path.join(tmpdir(), 'wails-bindings-'));
}

/**
 * Writes a placeholder at a repo-relative path inside root, creating parents.
 */
function place(root, relative) {
  const absolute = path.join(root, relative);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, '');
}

describe('missingBindings', () => {
  it('reports every required binding when the directory was never generated', () => {
    const root = makeRoot();

    try {
      expect(missingBindings(root)).toEqual([
        'frontend/wailsjs/go/desktop/App.js',
        'frontend/wailsjs/go/desktop/App.d.ts',
        'frontend/wailsjs/go/models.ts',
        'frontend/wailsjs/runtime/runtime.js',
      ]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('reports nothing once every required binding is present', () => {
    const root = makeRoot();

    try {
      for (const relative of requiredBindings) {
        place(root, relative);
      }

      expect(missingBindings(root)).toEqual([]);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('still reports a single binding lost from an otherwise generated tree', () => {
    const root = makeRoot();

    try {
      for (const relative of requiredBindings) {
        place(root, relative);
      }
      rmSync(path.join(root, 'frontend/wailsjs/go/models.ts'));

      // The whole reason this check exists: `wails generate module` exits 0
      // even when it cannot find wails.json, so a partial tree must not read
      // as success.
      expect(missingBindings(root)).toEqual(['frontend/wailsjs/go/models.ts']);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});

describe('ensureEmbedTarget', () => {
  it('creates the placeholder a fresh worktree needs to compile //go:embed all:frontend/dist', () => {
    const root = makeRoot();

    try {
      expect(ensureEmbedTarget(root)).toBe(true);
      expect(existsSync(path.join(root, 'frontend/dist/.keep'))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('fills a present but empty dist, which the embed pattern still rejects', () => {
    const root = makeRoot();

    try {
      mkdirSync(path.join(root, 'frontend/dist'), { recursive: true });

      expect(ensureEmbedTarget(root)).toBe(true);
      expect(existsSync(path.join(root, 'frontend/dist/.keep'))).toBe(true);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('leaves a real build output untouched', () => {
    const root = makeRoot();

    try {
      place(root, 'frontend/dist/index.html');

      expect(ensureEmbedTarget(root)).toBe(false);
      expect(readdirSync(path.join(root, 'frontend/dist'))).toEqual(['index.html']);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
