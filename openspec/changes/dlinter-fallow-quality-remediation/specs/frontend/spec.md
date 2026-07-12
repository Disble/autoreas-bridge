# Delta for Frontend

## MODIFIED Requirements

### Requirement: Package Baseline

The frontend package configuration MUST use exact version pinning for dependencies, include ESLint for code quality, and provide a `lint` script. The frontend quality contract MUST preserve the repository architecture rules while resolving findings at their root cause. It MUST NOT use broad ignores, new debt baselines, rule weakening, or edits to generated `frontend/wailsjs/**` code as remediation.

(Previously: The package baseline required exact dependency versions, ESLint, a lint script, and clean lint/build execution.)

#### Scenario: Canonical lint and build execution

- GIVEN the frontend project has ESLint configured
- WHEN the developer runs `bun --cwd="frontend" run lint`
- THEN the command MUST report zero lint errors across its configured scope
- AND `bun --cwd="frontend" run build` MUST succeed cleanly

#### Scenario: Changed-code Fallow audit

- GIVEN the measured changed-code baseline is 10 unused exports, 2 dev-dependencies-in-production, and 6 duplicate clone groups
- WHEN `bun --cwd="frontend" run fallow audit --quiet` and `bun --cwd="frontend" run fallow audit --format json --quiet` execute
- THEN the targeted changed-code findings MUST be resolved in both reports
- AND each reported result MUST remain attributed to its exact command scope

#### Scenario: Full semantic duplication analysis

- GIVEN `bun --cwd="frontend" run fallow dupes --format json --quiet --mode semantic` has a full-scope baseline of 19.98% duplication and 26 clone groups
- WHEN semantic duplication remediation is verified with that command
- THEN duplication MUST be reduced through behavior-preserving shared ownership or dumb UI primitive refactors
- AND changed-code audit metrics MUST NOT be presented as full semantic-duplication metrics

#### Scenario: Trace-backed deletion or retention

- GIVEN Fallow reports an export, file, or dependency as unused
- WHEN deletion or retention configuration is considered
- THEN relevant tests MUST establish the intended behavior before the decision
- AND `fallow dead-code --trace <file>:<export>` or `fallow dead-code --trace-dependency <name>` evidence MUST confirm the decision

#### Scenario: False-positive retention

- GIVEN trace and test evidence proves a reported item is intentionally required
- WHEN retention configuration is changed
- THEN the exception MUST be narrowly scoped to that verified item
- AND the remediation MUST NOT introduce broad ignores, broad baselines, or weaker lint or Fallow rules

#### Scenario: Generated Wails findings

- GIVEN a quality report references generated code under `frontend/wailsjs/**`
- WHEN the finding is triaged
- THEN generated Wails files MUST remain untouched
- AND remediation MUST occur in owned source or precise existing tool configuration when justified

#### Scenario: Behavior-changing remediation

- GIVEN a lint, dead-code, dependency, or duplication fix changes observable frontend behavior
- WHEN implementation begins
- THEN a corresponding test MUST be added or updated first and observed failing
- AND implementation MUST proceed through GREEN and REFACTOR while preserving dumb UI, hook anatomy, colocation, readonly props, helper JSDoc, and file-size constraints
