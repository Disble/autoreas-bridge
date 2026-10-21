# Activity change lines

A change is one write recorded in the activity history: an episode adjusted, a state set, a season
grade, a removal. Every surface that lists changes words them the same way, so a reader learns the
sentence once.

## The sentence

`<what changed> · <who changed it>`

| Action | What changed | Example |
|---|---|---|
| `episode_adjusted` | `episode <before> → <after>` | `episode 10 → 11 · from the phone` |
| `anime_state_set` | `state <before> → <after>`, with the stored state labels | `state Viendo → Finalizado · from the bridge` |
| `season_grade_set` | `grade <before> → <after>`; a first grade reads `grade <after>` | `grade 4 → 5 · from the phone` |
| `anime_soft_deleted`, `anime_restored`, `anime_repeated` | a fixed word: `removed`, `restored`, `watching again` | `restored · from the phone` |
| any other action | its words with underscores as spaces | `cover refreshed · by the bridge` |

Who changed it: `mobile` → `from the phone`, `desktop` → `from the bridge`, `system` →
`by the bridge`; an unknown writer is named as stored (`from legacy`).

When a snapshot cannot be read, the line falls back to the action's words (`episode adjusted`,
`grade changed`) rather than showing a half sentence.

## Where it lives

- One helper words every change: `describeActivityChange` in
  `frontend/src/features/activity/change-words/change-words.helpers.ts`, with its words in
  `change-words.constants.ts`. The Now view's "Recent changes" and the History tab both call it.
- Go sends the raw action type and the before/after snapshot JSON; it never words a change.
- A new action gets its wording in that helper, with a test in its `__tests__/`, before any surface
  shows it. Never word a change inline in a component or a second helper.
