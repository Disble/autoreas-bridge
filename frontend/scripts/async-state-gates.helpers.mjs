// ADR-032 §5 async-state gates: five local ESLint rules plus the identified-violation baseline.
//
// They are local rules rather than new `no-restricted-imports` / `no-restricted-syntax` options for
// three reasons. Each finding needs an identity (rule + file + specifier or symbol) that the baseline
// can name, which ESLint's message text does not carry. A flat-config block that sets an existing rule
// replaces its options for the files it matches, so the barrel and react-aria bans (and the icon-only
// `no-restricted-syntax` ban in .tsx files) would have to be restated per zone. And a relative
// `../infrastructure/...` import can only be judged after resolving it against the importing file.
//
// One plugin serves two consumers. eslint.config.js registers it with the committed baseline, so the
// editor and `dharness check` report every violation the baseline does not name, in clean and legacy
// files alike. check-async-state-gates.mjs registers it with a collector and no baseline, then compares
// what it found with the baseline to report new violations and stale entries.

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Baseline file name, relative to the frontend root. */
export const BASELINE_FILE = 'async-state-baseline.json';

/** Rule ids, in the order ADR-032 §5 lists them; each is `async-state/<id>` in ESLint. */
const ASYNC_STATE_RULE_IDS = [
  'no-infrastructure-import',
  'no-window-go',
  'react-query-in-shared-query',
  'zustand-vanilla-allow-list',
  'no-runtime-subscription',
];

/**
 * The closed list of files allowed to import `zustand/vanilla`, each with its reason.
 * A new store does not join this list: server state goes through `useBridgeQuery`.
 */
const ZUSTAND_VANILLA_ALLOW_LIST = {
  'src/features/catalog/ui/CatalogPanel/catalog-session.store.ts': 'Catalog session UI state (filters, view), which ADR-032 §4 leaves in Zustand.',
  'src/shared/keyboard/keyboard.constants.ts': 'Keyboard scope stack and keymap UI state (ADR-019, ADR-020).',
  'src/shared/store/download-runtime-store/download-runtime-store.helpers.ts': 'Downloads screen and missed-day notice UI state (selected run, hidden or shown missed day, notice feedback), which ADR-032 §4 leaves in Zustand.',
  'src/shared/store/preferences-store/preferences-store.helpers.ts': 'ADR-006 preferences read-model; leaves this list when it migrates.',
  'src/shared/store/season-store/season-store.store.ts': 'ADR-006 season read-model; leaves this list when it migrates (last, per ADR-032).',
};

/** Where the helpers and the skill live; every message ends with it. */
const GUIDE =
  'Skill: bridge-data. ADR-032: docs/adr/032-async-state-standard.md. Legacy entries: frontend/async-state-baseline.json (never add one for new code).';

/** The query helpers every boundary message points to. */
const QUERY_HELPERS =
  'useBridgeQuery / useBridgeMutation (frontend/src/shared/query/use-bridge-query/use-bridge-query.ts, frontend/src/shared/query/use-bridge-mutation/use-bridge-mutation.ts)';

/** Failure message per rule; `{{subject}}` is the specifier or symbol that identifies the finding. */
const MESSAGES = {
  'no-infrastructure-import': `'{{subject}}' reaches a backend adapter from features/shared. Read and write backend data through ${QUERY_HELPERS}; only shared/query and infrastructure import infrastructure/** or wailsjs/**. ${GUIDE}`,
  'no-window-go': `'{{subject}}' calls Wails bindings directly; only infrastructure/** touches window.go. Use ${QUERY_HELPERS}. ${GUIDE}`,
  'react-query-in-shared-query': `'{{subject}}' is imported outside shared/query. Use ${QUERY_HELPERS}, and createBridgeQueryTestWrapper (frontend/src/shared/query/test-support/bridge-query.test-support.tsx) in tests. ${GUIDE}`,
  'zustand-vanilla-allow-list': `'{{subject}}' creates a store outside the closed allow-list (ZUSTAND_VANILLA_ALLOW_LIST in frontend/scripts/async-state-gates.helpers.mjs). Server state goes through ${QUERY_HELPERS}. ${GUIDE}`,
  'no-runtime-subscription': `'{{subject}}' subscribes to a backend runtime event outside shared/query and infrastructure. Register an invalidation rule in BRIDGE_INVALIDATIONS (frontend/src/shared/query/bridge-runtime/bridge-runtime.constants.ts) and read the data with ${QUERY_HELPERS}. ${GUIDE}`,
};

/** Wails runtime subscription functions, whether imported or called. */
const EVENTS_ON_NAMES = new Set(['EventsOn', 'EventsOnce', 'EventsOnMultiple']);

/** Test files may fake the boundary these rules guard, so they are out of scope. */
const TEST_FILE = /(^|\/)(__tests__|test-support)\/|\.test(-support)?\.[cm]?[jt]sx?$|^src\/test\//u;

/** TypeScript wrappers that do not change which object an expression names. */
const TS_WRAPPERS = new Set(['TSAsExpression', 'TSNonNullExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);

/**
 * Builds the key that identifies one violation or baseline entry.
 * @param {{rule: string, file: string, specifier?: string, symbol?: string}} entry Violation or baseline entry.
 * @returns {string} Stable identity of the entry.
 */
function entryKey(entry) {
  return [entry.rule, entry.file, entry.specifier ?? '', entry.symbol ?? ''].join('\u0000');
}

/**
 * Reads and validates the committed baseline.
 * @param {string} root Frontend root holding the baseline file.
 * @returns {Array<{rule: string, file: string, specifier?: string, symbol?: string}>} Baseline entries.
 */
export function loadAsyncStateBaseline(root) {
  /** Parsed baseline document. */
  const document = JSON.parse(readFileSync(path.join(root, BASELINE_FILE), 'utf8'));
  for (const entry of document.violations) {
    if (!ASYNC_STATE_RULE_IDS.includes(entry.rule) || typeof entry.file !== 'string' || (entry.specifier ?? entry.symbol) === undefined) {
      throw new Error(`${BASELINE_FILE}: invalid entry ${JSON.stringify(entry)}`);
    }
  }
  return document.violations;
}

/**
 * Counts baseline entries per rule, in rule order, for the always-printed summary.
 * @param {Array<{rule: string}>} baseline Baseline entries.
 * @returns {string} For example `12 entries (no-infrastructure-import 10, no-runtime-subscription 2)`.
 */
export function summarizeBaseline(baseline) {
  /** Non-zero counts per rule. */
  const counts = ASYNC_STATE_RULE_IDS.map((rule) => [rule, baseline.filter((entry) => entry.rule === rule).length]).filter(([, count]) => count > 0);
  return `${baseline.length} entries (${counts.map(([rule, count]) => `${rule} ${count}`).join(', ') || 'none'})`;
}

/**
 * Splits found violations into those the baseline does not name, and baseline entries no longer found.
 * @param {object} params Comparison input.
 * @param {Array<object>} params.found Violations found in the checked files.
 * @param {Array<object>} params.baseline Baseline entries.
 * @param {(file: string) => boolean} params.inScope Whether a file was checked, so its entries can be judged stale.
 * @returns {{added: Array<object>, stale: Array<object>}} New violations and stale entries.
 */
export function compareWithBaseline({ found, baseline, inScope }) {
  /** Identities of the baseline entries. */
  const baselineKeys = new Set(baseline.map(entryKey));
  /** Identities of the violations found. */
  const foundKeys = new Set(found.map(entryKey));
  return {
    added: found.filter((violation) => !baselineKeys.has(entryKey(violation))),
    stale: baseline.filter((entry) => inScope(entry.file) && !foundKeys.has(entryKey(entry))),
  };
}

/**
 * Turns a specifier into the frontend-relative path it resolves to, or undefined for a package.
 * @param {string} file Importing file, relative to the frontend root.
 * @param {string} specifier Import specifier as written.
 * @returns {string|undefined} Resolved posix path, such as `src/infrastructure/x`.
 */
function resolveRelative(file, specifier) {
  return specifier.startsWith('.') ? path.posix.join(path.posix.dirname(file), specifier) : undefined;
}

/**
 * Whether a resolved import target is a backend adapter: infrastructure or the generated bindings.
 * @param {string|undefined} target Resolved posix path.
 * @returns {boolean} True for `src/infrastructure/**` and `wailsjs/**`.
 */
function isAdapterTarget(target) {
  return target !== undefined && /^(src\/infrastructure|wailsjs)(\/|$)/u.test(target);
}

/**
 * Removes TypeScript wrappers such as `(window as any)`.
 * @param {object} node Expression node.
 * @returns {object} The wrapped expression.
 */
function unwrap(node) {
  return TS_WRAPPERS.has(node.type) ? unwrap(node.expression) : node;
}

/**
 * Reads the name of a non-computed member property, a string-literal computed one, or an identifier.
 * @param {object|undefined} node Identifier, Literal or MemberExpression.
 * @returns {string|undefined} The name, when it is static.
 */
function staticName(node) {
  if (node === undefined) return undefined;
  /** Node without TypeScript wrappers. */
  const bare = unwrap(node);
  if (bare.type === 'Identifier') return bare.name;
  if (bare.type === 'Literal' && typeof bare.value === 'string') return bare.value;
  return bare.type === 'MemberExpression' ? staticName(bare.property) : undefined;
}

/**
 * Names the runtime-event subscription a call makes, or undefined when it makes none.
 *
 * Counted: Wails `EventsOn*`; any `subscribe<Name>(...)` (the runtime source ports' naming); and a
 * bare `.subscribe(...)` whose receiver name ends in `source` in any letter case (`pushSource.subscribe`, `source.subscribe`). Not counted:
 * a bare `.subscribe(...)` on anything else, which is how a Zustand store is subscribed.
 * @param {object} callee Callee of a CallExpression.
 * @returns {string|undefined} Symbol that identifies the subscription.
 */
function subscriptionSymbol(callee) {
  /** Called function name. */
  const name = staticName(callee);
  if (name === undefined) return undefined;
  if (EVENTS_ON_NAMES.has(name) || /^subscribe[A-Z0-9_]/u.test(name)) return name;
  /** Receiver name of a member call, such as `pushSource`. */
  const receiver = callee.type === 'MemberExpression' ? staticName(callee.object) : undefined;
  return name === 'subscribe' && receiver !== undefined && /source$/iu.test(receiver) ? `${receiver}.subscribe` : undefined;
}

/** Whether a production source file is inside shared/query. */
const inQuery = (file) => file.startsWith('src/shared/query/');

/** Whether a production source file is an infrastructure adapter. */
const inInfrastructure = (file) => file.startsWith('src/infrastructure/');

/** Which production source files each rule applies to. */
const RULE_SCOPES = {
  'no-infrastructure-import': (file) => file.startsWith('src/features/') || (file.startsWith('src/shared/') && !inQuery(file)),
  'no-window-go': (file) => !inInfrastructure(file),
  'react-query-in-shared-query': (file) => !inQuery(file),
  'zustand-vanilla-allow-list': (file) => !Object.hasOwn(ZUSTAND_VANILLA_ALLOW_LIST, file),
  'no-runtime-subscription': (file) => !inQuery(file) && !inInfrastructure(file),
};

/**
 * Decides whether a rule applies to a file; test files are never in scope.
 * @param {string} file Path relative to the frontend root.
 * @param {string} id Rule id.
 * @returns {boolean} True when the rule judges the file.
 */
function ruleApplies(file, id) {
  return file.startsWith('src/') && !TEST_FILE.test(file) && RULE_SCOPES[id](file);
}

/**
 * Finds the import-specifier violations of one source string.
 * @param {string} file Importing file, relative to the frontend root.
 * @param {string} specifier Import specifier.
 * @returns {Array<[string, string]>} Pairs of rule id and specifier.
 */
function importViolations(file, specifier) {
  /** Pairs found. */
  const pairs = [];
  if (isAdapterTarget(resolveRelative(file, specifier))) pairs.push(['no-infrastructure-import', specifier]);
  if (/^@tanstack\/(react-query|query-core)(\/|$)/u.test(specifier)) pairs.push(['react-query-in-shared-query', specifier]);
  if (specifier === 'zustand/vanilla') pairs.push(['zustand-vanilla-allow-list', specifier]);
  return pairs;
}

/**
 * Creates one ESLint rule that reports the findings of `id` through a shared reporter.
 * @param {string} id Rule id.
 * @param {(context: object) => {file: string, report: Function}|undefined} begin Per-file setup; undefined when out of scope.
 * @returns {object} ESLint rule module.
 */
function createRule(id, begin) {
  return {
    meta: { type: 'problem', schema: [], messages: { violation: MESSAGES[id] } },
    create(context) {
      /** Per-file reporter, or undefined when this rule does not apply. */
      const scope = begin(context, id);
      if (scope === undefined) return {};
      /**
       * Reports one import source for this rule.
       * @param {object} source Literal node of the specifier.
       * @returns {void}
       */
      const checkSource = (source) => {
        if (source?.type !== 'Literal' || typeof source.value !== 'string') return;
        for (const [rule, specifier] of importViolations(scope.file, source.value)) {
          if (rule === id) scope.report(source, { specifier });
        }
      };
      return {
        ImportDeclaration(node) {
          checkSource(node.source);
          if (id !== 'no-runtime-subscription') return;
          for (const specifier of node.specifiers) {
            /** Imported binding name. */
            const imported = specifier.type === 'ImportSpecifier' ? staticName(specifier.imported) : undefined;
            if (EVENTS_ON_NAMES.has(imported)) scope.report(specifier, { symbol: imported });
          }
        },
        ExportNamedDeclaration: (node) => checkSource(node.source),
        ExportAllDeclaration: (node) => checkSource(node.source),
        ImportExpression: (node) => checkSource(node.source),
        MemberExpression(node) {
          if (id !== 'no-window-go' || staticName(node.property) !== 'go' || (node.computed && node.property.type !== 'Literal')) return;
          /** Object the property is read from. */
          const object = unwrap(node.object);
          if (object.type === 'Identifier' && (object.name === 'window' || object.name === 'globalThis')) {
            scope.report(node, { symbol: `${object.name}.go` });
          }
        },
        CallExpression(node) {
          /** Subscription the call makes, if any. */
          const symbol = id === 'no-runtime-subscription' ? subscriptionSymbol(node.callee) : undefined;
          if (symbol !== undefined) scope.report(node, { symbol });
        },
      };
    },
  };
}

/**
 * Builds the `async-state` ESLint plugin.
 * @param {object} options Plugin options.
 * @param {string} options.root Frontend root that file paths are relative to.
 * @param {Array<object>} [options.baseline] Entries not reported to ESLint (editor, dharness check).
 * @param {(violation: object) => void} [options.onViolation] Receives every violation, baselined or not.
 * @returns {object} ESLint plugin with one rule per id in ASYNC_STATE_RULE_IDS.
 */
export function createAsyncStatePlugin({ root, baseline = [], onViolation }) {
  /** Identities ESLint stays silent about. */
  const silenced = new Set(baseline.map(entryKey));
  /**
   * Prepares the reporter of one rule for one file.
   * @param {object} context ESLint rule context.
   * @param {string} id Rule id.
   * @returns {{file: string, report: Function}|undefined} Reporter, or undefined when out of scope.
   */
  const begin = (context, id) => {
    /** File relative to the frontend root, posix separators. */
    const file = path.relative(root, context.filename).split(path.sep).join('/');
    if (!ruleApplies(file, id)) return undefined;
    return {
      file,
      report(node, subject) {
        /** Identified violation. */
        const violation = { rule: id, file, ...subject, line: node.loc.start.line };
        onViolation?.(violation);
        if (!silenced.has(entryKey(violation))) {
          context.report({ node, messageId: 'violation', data: { subject: subject.specifier ?? subject.symbol } });
        }
      },
    };
  };
  return { rules: Object.fromEntries(ASYNC_STATE_RULE_IDS.map((id) => [id, createRule(id, begin)])) };
}

/**
 * ESLint `rules` entry that switches every async-state rule on as an error.
 * @returns {Record<string, 'error'>} Rule settings keyed by `async-state/<id>`.
 */
export function asyncStateRuleSettings() {
  return Object.fromEntries(ASYNC_STATE_RULE_IDS.map((id) => [`async-state/${id}`, 'error']));
}

/**
 * Renders a found violation with its location and the rule's guidance.
 * @param {{rule: string, file: string, line: number, specifier?: string, symbol?: string}} violation Violation.
 * @returns {string} One report line.
 */
export function formatViolation(violation) {
  return `${violation.file}:${violation.line} [${violation.rule}] ${MESSAGES[violation.rule].replace('{{subject}}', violation.specifier ?? violation.symbol)}`;
}

/**
 * Renders a stale entry exactly as it must be deleted from the baseline.
 * @param {{rule: string, file: string, specifier?: string, symbol?: string}} entry Stale baseline entry.
 * @returns {string} One report line naming the entry.
 */
export function formatStaleEntry(entry) {
  /** Entry in the baseline's own field order. */
  const named = { rule: entry.rule, file: entry.file, ...(entry.specifier === undefined ? { symbol: entry.symbol } : { specifier: entry.specifier }) };
  return `stale entry, no longer found; delete it from frontend/${BASELINE_FILE}: ${JSON.stringify(named)}`;
}
