# Episode Durations — Editor UI Design

**Status:** approved design guide (2026-10-13). This is the binding guide for the Editor part of the
episode-durations feature. The rest of the feature (storage, measurement, sync to Mobile) is still
under analysis and is not specified here.

**Approved mockup:** the canvas "Editor — Episode metadata",
<https://claude.ai/artifact/Dt1pS5Yn3E5KUwgMbJK95i>. It holds every screen and state listed below.
It is drawn with the app's real HeroUI v3 dark tokens and no overrides (see the `autoreas-theme`
skill). When this file and the canvas disagree, ask before picking one.

## 1. Where it lives

- The Editor is the only place where episode durations are edited, like every other anime field.
- The section is an **accordion named "Episodes"**, built the same way as "More details": a
  full-width secondary trigger.
- **The trigger shows a summary even when closed:** "N of M measured" plus a warning chip
  "1 long" when a long episode exists.
- Inside the accordion, the section does not repeat its title or draw its own border.
- Episode edits join the Editor draft, so **Save** and **Discard changes** cover them like every
  other field. An edited row carries an "Unsaved" chip until then.

## 2. The section

- **Table:** one row per episode, with the columns Episode, Duration, Source and Edit.
  - **Duration:** whole minutes. A warning-soft "Long" chip appears above 30 min, for TV only.
  - **Source:** `Measured`, `Manual`, `Not measured`, `Not measured · file found` or
    `Manual · no file yet`.
  - **Edit:** an icon-only pencil that opens the edit modal for that episode.
- **Re-analyze folder:** an icon-only button in the section header. Its label and any disabled
  reason ("Folder not found", "Set a folder first", "Analyzing…") are a **tooltip** and live in the
  `aria-label`. A disabled button gets no hover, so the HeroUI `Tooltip` wraps a container around the
  button, not the button itself.
- **Add episode:** a text button in the **last row of the table**. It is deliberately not in the
  header next to Re-analyze, because two adjacent icon buttons are easy to confuse and one of them
  starts an analysis.
  - It stays enabled without a folder or a total, and is disabled only while an analysis runs.
  - A progressively rendered table shows the row only at the end of the list. That is fine for
    seasonal anime (12–25 episodes). Pin it to the table foot if very long series ever matter.
- **Which rows exist:** the union of the stored durations, the episode files found in the folder,
  and episodes 1..Total when Total episodes is known.

## 3. States (the "state matrix" artboard)

| Case | What the section shows |
|---|---|
| Folder found, all measured | The table. |
| No folder, Total known | Accent alert "No folder set"; rows 1..Total marked `Not measured`, editable by hand; Re-analyze disabled. |
| No folder, no Total, no durations | Empty state (below). Re-analyze disabled. |
| Folder set but missing, no durations | Warning alert "Folder not found" plus the empty state. |
| **Folder missing, durations stored** | Accent alert "Showing saved durations": the normal case for a finished anime. Saved data stays; only re-analysis is disabled. |
| Total unknown | Rows come from stored durations and files found; the footer says the list grows with downloads. |
| More episode files than Total | Warning alert naming the episode beyond the total. |
| Analysis running | Progress ("Measuring episode 5 of 12") with Cancel; row edits are disabled; the rest of the Editor stays usable. |
| Unsaved edit | An "Unsaved" chip on the row. |
| Type is not TV | The duration is stored, there is no Long chip, and a note says long marks apply to TV only. |

**Empty state:** `AirisEmptyState` with the Editor artwork (`editor-library.webp`) in the
**side-by-side layout**. The mascot sits on the left at 128px; the title, the description and one
primary "Add episode" action sit on the right. See the `autoreas-theme` skill, section "Empty state
inside a section". It belongs in `AirisEmptyState` as a new size, not hand-rolled in the feature.
Loading uses a skeleton and failure uses the surface `Alert`, never the mascot.

## 4. Re-analyze review (modal)

Re-analysis never writes directly. It opens a review the user confirms.

- **Header:** the folder path and a status alert ("Folder found · N episode files recognized").
- **Summary chips:** changes, new, manual kept, unchanged.
- **Table:** Episode | Current | Measured now | Result, where Result is one of `Unchanged`,
  `Will update`, `Will add`, `Manual kept`, `Skipped`, `Unreadable` or `Not reached`.
- **Primary action:** "Confirm N changes".

| Outcome | Behavior |
|---|---|
| Folder stops responding mid-analysis | Warning: what was measured can be applied; what was not reached keeps its current value. Actions: Cancel, Try again, Apply. |
| Some files skipped or unreadable | A half episode (x.5), two files claiming the same episode, or an unreadable file. Each keeps its saved duration. |
| Nothing differs | "Everything is up to date", Close only. |
| No episode files recognized | Warning, Close only. Saved durations untouched. |
| ffprobe not available | Danger alert, Close only. Saved durations untouched; manual entry still works. |

**Invariant:** a failed or partial analysis never deletes or overwrites a stored duration.

## 5. Manual entry

- **Edit episode N** (modal): Minutes, a line naming who set the current value ("Measured from the
  file" or "Set by hand"), Clear duration, Cancel and Apply. **Clear duration** deletes the
  episode's row; it is measured again if the file is still there.
- **Add episode** (modal): an episode number, prefilled with the next number after the highest known
  episode and editable, plus Minutes.
  - Above 30 minutes the form says the episode will be marked long.
  - A number that already has a duration is an inline error, "Episode 5 already has 24 min.", with
    "Edit episode 5 instead". Add is disabled; nothing is overwritten.
  - This covers an episode announced as long before its file exists (Total unknown, the next
    episode's length known).

## 6. Storage rules the UI relies on (decided 2026-10-13)

Each episode stores one duration plus `source` (`measured` or `manual`). `source` is the writer of
the current value only, never a history. The full storage analysis is the artifact "Episode
Durations Analysis", <https://claude.ai/artifact/2r9WEWGAEq4JCG5z6XsfJp>.

1. **A manual value is kept on re-analysis.** The review shows "Manual kept" next to the new
   reading; the user can still edit the value.
2. **A duration can be added or edited by hand without a folder.**
3. **Automatic measurement only fills gaps.** A download or the background backfill never
   overwrites an existing value. Only the Editor changes one.
4. **No previous measurement is shown.** Without history, the edit modal shows the current source,
   not a "Last measured" value. This replaced the original mockup line (2026-10-13).

Out of scope for v1: half episodes (x.5). They are reported as skipped and never stored.
