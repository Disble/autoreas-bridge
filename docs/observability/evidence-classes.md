# Evidence classes

Each resolved issue in `data/resolved-issues.json` lists the classes of evidence its diagnosis needed. The
battery checks whether each class still exists when the issue is investigated.

| Class | Evidence | Issues that needed it | Kept by (target) |
|---|---|---|---|
| C1 | a failed request, with its whole body | 10 | incident window, 90 d |
| C2 | a successful response body | 14 | recorder 2 h; response versions 90 d |
| C3 | a successful request body (what the phone sent) | 12 | write journal 90 d |
| C4 | metadata and timing of every request | 15 | recorder 2 h; hourly rollup 90 d |
| C5 | WebSocket lifecycle and broadcasts | 8 | event and WS ledger 90 d |
| C6 | bridge runtime events | 23 | event and WS ledger 90 d |
| C7 | the error cause | 20 | the failed record itself (P1) |
| C8 | millisecond ordering and correlation | 11 | every record (P2, P3) |
| C9 | mobile diagnostics and telemetry | 11 | existing mobile tables |
| C10 | domain state and history | 43 | domain tables, months deep |
| C11 | a record of every write | 19 | write journal 90 d |
| C12 | bridge lifecycle (startups, unclean stops) | 15 | event ledger 90 d |
| C13 | frontend and WebView errors | 11 | bridge events (P7), 90 d |

Counts add up to more than 92 because most issues needed several classes.

## Rules for assigning classes

- Assign a class only when the diagnosis actually read that evidence, as recorded in the docs, commits or
  Engram. Do not assign one because it would have been convenient.
- C10 is the same in every architecture, because domain tables are not debug capture. Record it anyway so
  the battery shows what the domain already answers.
- When the source does not say how the bug was found, record `confidence: low` on the issue.
