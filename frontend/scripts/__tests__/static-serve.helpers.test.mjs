import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveServedFile } from '../static-serve.helpers.mjs';

/** Root of the throwaway tree these tests serve from. */
let root = '';
/** The bundle directory standing in for dist/. */
let dist = '';
/** The SPA fallback inside that bundle. */
let fallback = '';
/** A real file OUTSIDE the bundle, the thing a traversal would be reaching for. */
let secret = '';

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'static-serve-'));
  dist = path.join(root, 'dist');
  mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fallback = path.join(dist, 'index.html');
  writeFileSync(fallback, '<!doctype html>');
  writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)');
  secret = path.join(root, 'secret.txt');
  writeFileSync(secret, 'do not serve me');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('resolveServedFile', () => {
  it('serves a real asset inside the bundle', () => {
    expect(resolveServedFile({ dist, requested: '/assets/app.js', fallback })).toBe(
      path.join(dist, 'assets', 'app.js'),
    );
  });

  it('serves the fallback for the root path', () => {
    expect(resolveServedFile({ dist, requested: '/', fallback })).toBe(fallback);
  });

  it('serves the fallback for a path that does not exist', () => {
    expect(resolveServedFile({ dist, requested: '/nope.js', fallback })).toBe(fallback);
  });

  it('refuses a traversal that escapes the bundle, even though the file is real', () => {
    expect(resolveServedFile({ dist, requested: '/../secret.txt', fallback })).toBe(fallback);
  });

  it('refuses a deep traversal built from several segments', () => {
    expect(resolveServedFile({ dist, requested: '/assets/../../secret.txt', fallback })).toBe(fallback);
  });

  it('refuses the bundle directory itself rather than reading a directory', () => {
    expect(resolveServedFile({ dist, requested: '/.', fallback })).toBe(fallback);
  });

  it('refuses a directory inside the bundle rather than handing it to readFileSync', () => {
    expect(resolveServedFile({ dist, requested: '/assets', fallback })).toBe(fallback);
  });

  it('refuses a sibling directory whose name merely starts with the bundle name', () => {
    const sibling = `${dist}-layout`;
    mkdirSync(sibling, { recursive: true });
    writeFileSync(path.join(sibling, 'leak.js'), 'leak');
    expect(resolveServedFile({ dist, requested: '/../dist-layout/leak.js', fallback })).toBe(fallback);
  });
});
