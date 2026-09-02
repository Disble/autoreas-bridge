// One request-path resolver, shared by the two headless-browser smoke servers.
//
// Both scripts stand up a throwaway HTTP server on 127.0.0.1 and point Edge at
// it. That server took its path straight from the request, so
// `path.join(DIST, requested)` walked out of the bundle the moment a request
// carried `..` (SonarQube jssecurity:S2083, with jssecurity:S6549 on the
// existence check feeding it). The exposure was small -- loopback, an ephemeral
// port, a few seconds inside a pre-commit hook, and the only client is the
// browser we spawn ourselves -- but the traversal was real rather than a false
// positive, and the guard costs one resolve plus a prefix test.
//
// This lives in its own module rather than in each script because a security
// guard written twice is a security guard that drifts. It is also the only part
// of either script that is worth unit testing: the rest is spawning a browser.

import { statSync } from 'node:fs';
import path from 'node:path';

/**
 * Resolves one requested URL path to a real file inside `dist`, or to the fallback.
 *
 * Everything that is not a regular file strictly inside `dist` collapses to
 * `fallback`: the root path, a miss, a directory, and any traversal. Callers
 * therefore can never be handed a path outside the bundle they meant to serve.
 *
 * @param {object} params - The lookup to resolve.
 * @param {string} params.dist - Absolute path of the bundle being served.
 * @param {string} params.requested - Already-decoded pathname from the request.
 * @param {string} params.fallback - Absolute path to serve when the request does not resolve; it must itself sit inside `dist`.
 * @returns {string} `fallback`, or the absolute path of a real file inside `dist`.
 */
export function resolveServedFile({ dist, requested, fallback }) {
  // The leading '.' keeps the second argument relative. Without it, a requested
  // path of '/etc/passwd' would reset path.resolve to the filesystem root and
  // the prefix test below would be the only thing left standing.
  const candidate = path.resolve(dist, `.${requested}`);
  // dist + path.sep, never bare dist: a sibling bundle named `dist-layout`
  // starts with `dist` as a string while sitting entirely outside it.
  const insideDist = candidate.startsWith(dist + path.sep);
  const stats = insideDist ? statSync(candidate, { throwIfNoEntry: false }) : undefined;
  return stats?.isFile() ? candidate : fallback;
}
