# Skill Registry

- Generated: 2026-04-05
- Project: `autoreas-bridge`
- SDD mode: `hybrid`

## Project conventions

- `AGENTS.md` defines the repo workflow: SDD-first execution, real-boundary testing, and mandatory use of bridge-specific skills when applicable.
- `CLAUDE.md` points tools back to `AGENTS.md`, `openspec/config.yaml`, and `.atl/skill-registry.md` as canonical instructions.

## Project-local skills

| Skill | Source | Trigger / use case |
| --- | --- | --- |
| `bridge-testing` | `skills/bridge-testing` | Tests del parser legacy, event bus, watcher, SQLite, sync y API usando boundaries reales |
| `bridge-debugging` | `skills/bridge-debugging` | Investigación de bugs y regresiones en filesystem, SQLite, parser y sync |
| `frontend-theme` | `skills/frontend-theme` | Theming y tokens de color del frontend (HeroUI v3 + Tailwind v4): elegir utilities que SÍ renderizan, estados activo/hover/focus, y debug de "no se ve el color/fondo" |
| `dnd-kit` | `.claude/skills/dnd-kit` | Drag-and-drop del frontend: listas sortable y tableros kanban/multi-columna con el NUEVO `@dnd-kit/react` + `@dnd-kit/helpers` (React 19 + StrictMode, pointer-based para WebView2); migración desde `@dnd-kit/core` legacy; debug de "no arrastra nada" |
| `fallow` | `.agents/skills/fallow` | Dead code, dependency hygiene, duplication, complexity y changed-code audit del frontend con la pol?tica local documentada en `docs/fallow-usage.md` |

## User-level skills (deduplicated, non-SDD)

| Skill | Source | Trigger / use case |
| --- | --- | --- |
| `branch-pr` | `~/.config/opencode/skills/branch-pr` | Crear PRs y preparar cambios para review |
| `cognitive-complexity` | `~/.config/opencode/skills/cognitive-complexity` | Medir/comparar complejidad cognitiva y refactorizar control flow |
| `find-skills` | `~/.agents/skills/find-skills` | Buscar skills instalables o extensiones de capacidades |
| `go-testing` | `~/.config/opencode/skills/go-testing` | Tests en Go, table-driven tests, integración, Bubbletea |
| `grill-me` | `~/.agents/skills/grill-me` | Stress-test de planes o diseños |
| `issue-creation` | `~/.config/opencode/skills/issue-creation` | Crear issues de GitHub |
| `judgment-day` | `~/.config/opencode/skills/judgment-day` | Review adversarial con doble juez |
| `kin` | `~/.config/opencode/skills/kin` | Consultar docs externas de librerías antes de codear |
| `kin-init` | `~/.config/opencode/skills/kin-init` | Inicializar integración KIN en el proyecto |
| `no-duplication` | `~/.claude/skills/no-duplication` | Reducir duplicación, especialmente en tests Go |
| `react-doctor` | `~/.config/opencode/skills/react-doctor` | Revisar cambios React al cerrar una tarea |
| `skill-creator` | `~/.config/opencode/skills/skill-creator` | Crear nuevas skills de agentes |
| `stylistic-addon-debugging` | `~/.claude/skills/stylistic-addon-debugging` | Debugging específico de stylistic-addon |
| `stylistic-addon-testing` | `~/.claude/skills/stylistic-addon-testing` | Testing específico de stylistic-addon |
| `tdd` | `~/.agents/skills/tdd` | Red-green-refactor y desarrollo test-first |

## Repo fit

- Skills inmediatamente relevantes para este repo: `bridge-testing`, `bridge-debugging`, `go-testing`, `tdd`, `react-doctor`, `branch-pr`, `issue-creation`, `judgment-day`, `cognitive-complexity`, `kin`.
- Como el proyecto arranca desde un scaffold de Wails, los primeros cambios probablemente vivan en Go (`main.go`, `internal/...`) antes que en React.
