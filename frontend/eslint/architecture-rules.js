// Architecture enforcement rules for the autoreas-bridge Wails frontend.
//
// These rules make the Feature-Sliced Design constraints documented in
// ARCHITECTURE.md / AGENTS.md / CLAUDE.md DETERMINISTIC: instead of living as
// prose that an agent or developer can silently violate, every boundary below
// is enforced by ESLint and gated by lefthook before a commit lands.
//
// Adapted from the proven autoreas-mobile / ollama-telemetry standards. The
// infrastructure edge here is the generated Wails bindings under `wailsjs/`,
// not an `infrastructure/` package, so the layering rules target `wailsjs`.

const appLayerReactHooksPattern =
  '^use(State|Reducer|Effect|LayoutEffect|InsertionEffect|SyncExternalStore|Memo|Callback|Ref|Context|Transition|DeferredValue|ImperativeHandle|DebugValue|Id|Optimistic|ActionState)?$';

// Dumb-UI / delivery layering: .tsx files are presentational and must reach the
// desktop runtime only through a feature hook, never by importing Wails bindings
// directly.
const tsxLayeringSyntaxRules = [
  {
    selector: 'ImportDeclaration[source.value=/wailsjs/]',
    message:
      'Feature Boundary: UI components (.tsx) cannot import Wails bindings directly. Use the colocated feature hook (use-*.ts) instead.',
  },
];

// Dumb-UI Rule (constraint #1): feature .tsx files must not run side effects.
// useEffect/useLayoutEffect belong in the colocated hook, never in the view.
const dumbUiEffectSyntaxRules = [
  {
    selector: "CallExpression[callee.name=/^use(Effect|LayoutEffect)$/]",
    message:
      'Dumb UI Rule: feature .tsx files cannot use useEffect/useLayoutEffect. Move side effects into the colocated use-*.ts hook.',
  },
  {
    selector: "CallExpression[callee.object.name='React'][callee.property.name=/^use(Effect|LayoutEffect)$/]",
    message:
      'Dumb UI Rule: feature .tsx files cannot use React.useEffect/useLayoutEffect. Move side effects into the colocated use-*.ts hook.',
  },
];

const schemaPlacementSyntaxRules = [
  {
    selector: 'ImportDeclaration[source.value=/^zod(?:\\/.*)?$/]',
    message:
      'Strict Colocation: Zod schemas must live in a dedicated *.schema.ts file, never inside a component or hook.',
  },
];

const colocationSyntaxRules = [
  {
    selector: 'Program > VariableDeclaration',
    message:
      'Strict Colocation: root-level variables are forbidden in feature components/hooks. Move constants to *.constants.ts and helper state into the function body or a dedicated module.',
  },
  {
    selector: 'Program > FunctionDeclaration:not(:has(Identifier[id.name=/^(use[A-Z]|[A-Z])/]))',
    message:
      'Strict Colocation: root-level helper functions are forbidden in feature components/hooks. Move them to *.helpers.ts.',
  },
  {
    selector: 'Program > ExportNamedDeclaration > VariableDeclaration',
    message:
      'Strict Colocation: export feature components and hooks as named function declarations, not root-level consts.',
  },
  {
    selector: 'Program > ExportDefaultDeclaration > ArrowFunctionExpression',
    message: 'Strict Colocation: export feature components and hooks as named function declarations.',
  },
  {
    selector: 'TSInterfaceDeclaration',
    message: 'Strict Colocation: interfaces must be declared in a separate *.types.ts file, not inside the component or hook.',
  },
  {
    selector: 'TSTypeAliasDeclaration',
    message: 'Strict Colocation: type aliases must be declared in a separate *.types.ts file, not inside the component or hook.',
  },
];

// Delivery Layer Rule (constraint #4): App.tsx and src/app/** are composition
// only — no Wails bindings, no React hooks, no direct feature/shared hooks.
const appDeliverySyntaxRules = [
  ...tsxLayeringSyntaxRules.map((rule) => ({
    ...rule,
    message:
      'Delivery Rule: app/ composition files cannot import Wails bindings directly. Move runtime access behind a feature entrypoint.',
  })),
  {
    selector: `ImportDeclaration[source.value='react'] ImportSpecifier[imported.name=/${appLayerReactHooksPattern}/]`,
    message: 'Delivery Rule: app/ composition files cannot import React hooks. Move screen logic into feature hooks or components.',
  },
  {
    selector: `MemberExpression[object.name='React'][property.name=/${appLayerReactHooksPattern}/]`,
    message:
      'Delivery Rule: app/ composition files cannot call React hooks through the React namespace. Move screen logic into feature hooks or components.',
  },
];

// Hook Anatomy Rule (constraint #2): the 10-step ordering. Derived state
// (useMemo) before callbacks (useCallback) before effects (useEffect), and the
// hook must end with a return.
const featureHookAnatomySyntaxRules = [
  {
    selector:
      'ExportNamedDeclaration > FunctionDeclaration[id.name=/^use[A-Z0-9]/] > BlockStatement > ExpressionStatement:has(CallExpression[callee.name="useEffect"]) ~ VariableDeclaration:has(CallExpression[callee.name=/^use(Memo|Callback)$/])',
    message: 'Hook Anatomy Rule: useEffect must come after derived state and callbacks in feature hooks.',
  },
  {
    selector:
      'ExportNamedDeclaration > FunctionDeclaration[id.name=/^use[A-Z0-9]/] > BlockStatement > ExpressionStatement:has(CallExpression[callee.object.name="React"][callee.property.name="useEffect"]) ~ VariableDeclaration:has(CallExpression[callee.name=/^use(Memo|Callback)$/])',
    message: 'Hook Anatomy Rule: React.useEffect must come after derived state and callbacks in feature hooks.',
  },
  {
    selector:
      'ExportNamedDeclaration > FunctionDeclaration[id.name=/^use[A-Z0-9]/] > BlockStatement > VariableDeclaration:has(CallExpression[callee.name="useCallback"]) ~ VariableDeclaration:has(CallExpression[callee.name="useMemo"] )',
    message: 'Hook Anatomy Rule: useMemo derived state must come before useCallback callbacks in feature hooks.',
  },
  {
    selector:
      'ExportNamedDeclaration > FunctionDeclaration[id.name=/^use[A-Z0-9]/] > BlockStatement > :not(ReturnStatement):last-child',
    message: 'Hook Anatomy Rule: feature hooks must end with a return statement.',
  },
];

// Readonly Props Rule (constraint #5): component props parameters must use
// Readonly<Props> at the function boundary.
const readonlyUiPropsBoundarySyntaxRules = [
  {
    selector:
      'ExportNamedDeclaration > FunctionDeclaration > Identifier[typeAnnotation.typeAnnotation.type="TSTypeReference"][typeAnnotation.typeAnnotation.typeName.name=/Props$/]',
    message: 'Type Contract Rule: component props parameters must use Readonly<Props> at the function boundary.',
  },
  {
    selector:
      'ExportNamedDeclaration > FunctionDeclaration > ObjectPattern[typeAnnotation.typeAnnotation.type="TSTypeReference"][typeAnnotation.typeAnnotation.typeName.name=/Props$/]',
    message: 'Type Contract Rule: destructured component props parameters must use Readonly<Props> at the function boundary.',
  },
];

const uiExportDocumentationContexts = ['ExportNamedDeclaration > FunctionDeclaration'];

const publicTypeContractDocumentationContexts = [
  'ExportNamedDeclaration > TSInterfaceDeclaration',
  'ExportNamedDeclaration > TSTypeAliasDeclaration',
];

const publicConstantDocumentationContexts = ['ExportNamedDeclaration[declaration.type="VariableDeclaration"]'];

const publicHookDocumentationContexts = ['ExportNamedDeclaration > FunctionDeclaration[id.name=/^use[A-Z0-9]/]'];

const helperDocumentationContexts = [
  'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > ArrowFunctionExpression',
  'ExportNamedDeclaration > FunctionDeclaration',
];

const importXExtensions = ['.js', '.jsx', '.ts', '.tsx', '.d.ts'];

/**
 * Re-emit a rules map with every active severity downgraded to "warn".
 * Used to surface react-doctor findings as warnings (advisory, non-blocking)
 * instead of hard errors that would break the gate on pre-existing patterns.
 * @param {Record<string, unknown>} rules - source rules map keyed by rule name.
 * @returns {Record<string, unknown>} the same rules with non-off severities set to "warn".
 */
function downgradeRuleSeverities(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([ruleName, ruleValue]) => {
      if (ruleValue === 'off' || ruleValue === 0) {
        return [ruleName, 'off'];
      }

      if (Array.isArray(ruleValue)) {
        return [ruleName, ['warn', ...ruleValue.slice(1)]];
      }

      return [ruleName, 'warn'];
    }),
  );
}

export {
  appDeliverySyntaxRules,
  appLayerReactHooksPattern,
  colocationSyntaxRules,
  downgradeRuleSeverities,
  dumbUiEffectSyntaxRules,
  featureHookAnatomySyntaxRules,
  helperDocumentationContexts,
  importXExtensions,
  publicConstantDocumentationContexts,
  publicHookDocumentationContexts,
  publicTypeContractDocumentationContexts,
  readonlyUiPropsBoundarySyntaxRules,
  schemaPlacementSyntaxRules,
  tsxLayeringSyntaxRules,
  uiExportDocumentationContexts,
};
