# Instruction mirror consolidation

## Goal

Keep `AGENTS.md` and `CLAUDE.md` byte-identical while retaining durable, actionable project rules and moving historical rationale out of the always-loaded instructions.

## Tasks

- [x] Draft one concise canonical instruction set without feature-specific references or static skill-loading lists.
- [x] Copy the canonical content to both mirror files and verify they are identical.
- [~] Review the diff and create the required work-unit commit after checks pass.

## Constraints

- Keep autonomous post-verification commits as a project rule.
- Do not include the dashboard reference.
- Skills are loaded on demand; do not repeat their trigger lists here.
- Retain operational rules previously exclusive to `CLAUDE.md`: render smoke, Wails shell/binding boundaries, keyboard/keymap, and shared stateful-widget placement.

## Evidence

- `cmp -s AGENTS.md CLAUDE.md` passed after synchronization.
- Both mirrors are 81 lines / 9,072 bytes; the prior combined 70,337-byte instruction payload is now 18,144 bytes.
- `git diff --check` passed.
