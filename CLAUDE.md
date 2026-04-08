# CLAUDE.md

This repository uses `AGENTS.md` as the primary project instruction file.

## Read First

- `AGENTS.md`
- `openspec/config.yaml`
- `.atl/skill-registry.md`

## Project Notes

1. Follow the SDD workflow and active change artifacts under `openspec/changes/`. The entire SDD workflow (explore -> propose -> spec -> design -> tasks -> apply -> verify -> archive) MUST run completely automatically and proactively from start to finish without pausing for user confirmation or review between phases. Only stop for hard, unresolvable blockers. Execute the rest of the skills exactly as indicated but with ZERO user intervention.
2. **If docs, specs, or archived changes disagree with the codebase, the code wins as the runtime truth. Record the drift explicitly before proposing fixes.**
3. **Final verification MUST be performed by the orchestrating agent itself, not by a subagent.** Subagents may still be used for other phases (proposal, spec, design, tasks, or apply) when appropriate.
4. **After verify passes, the orchestrating agent MUST create the commit before reporting the change as fully verified.** Commit-time hooks and validations are part of the true verification boundary.
5. Load `bridge-testing` for bridge test work.
6. Load `bridge-debugging` for regressions and boundary investigation.
7. Prefer real fixture validation with `resources/autoreas-data/animes.dat` when parser compatibility matters.
