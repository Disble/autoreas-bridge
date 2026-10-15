# Typography

## The text primitive

The installed `@heroui/react` (3.2.4 at the time of writing) exports `Typography`:

- `type="h1"` … `"h6"`, `"body"`, `"body-sm"`, `"code"`.
- `color="default" | "muted"` only. `color="warning"` is a typecheck error; semantic text color goes
  through a Tailwind utility (`className="text-warning"`).
- Never raw `<h1>` / `<p>` for content headings and body text.

Installed code wins over docs. An older HeroUI (`3.0.2`, seen in a stale worktree) exported `Text`
instead, and importing the wrong one broke `wails dev`. When package versions drift, check the
exports in the target worktree's `node_modules` before importing a component the docs mention.

## Conventions seen in shared components

- Empty-state titles are `Typography type="h3"`, descriptions `Typography color="muted"
  type="body-sm"` (`AirisEmptyState`, `AwaitingSelectionPane`). Row-sized titles add
  `className="text-sm"`.
- Small uppercase section labels use `text-[11.5px] font-semibold tracking-wide text-muted uppercase`
  (the awaiting-selection preview). Reuse the shared component rather than copying the classes.

## Accessible names and hidden text

An `sr-only` suffix inside a control joins the visible label with NO separator: `Sunday` +
`<span class="sr-only">today</span>` announces as `Sundaytoday`, in a real screen reader and not just
in a test query. Give the hidden phrase its own leading punctuation (`', today'`) instead of relying
on JSX whitespace, which the formatter can remove.

## Copy language

UI copy is English. Spanish appears only as runtime data values (anime titles, `estado` labels,
"Sin ver" / "Ver hoy" / "Visto").
