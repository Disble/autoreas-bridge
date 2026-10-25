# Observability: debug capture

This section documents how the bridge records what happened, how long it keeps each kind of evidence, and
how people and AI tools read it back. It is living documentation and is updated with every delivery of
the feature. The decision itself is fixed in `docs/adr/028-debug-capture-retention.md`.

## In one picture

```
                         Everything the bridge sees
          (phone requests, WebSocket, bridge events, frontend errors)
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
  ┌─────────────────┐    ┌────────────────────┐    ┌──────────────────┐
  │ Recorder        │    │ Incidents          │    │ Ledger           │
  │ everything,     │───▶│ a failure pins     │    │ one line per     │
  │ in full         │    │ −2 min … +30 s     │    │ fact             │
  └─────────────────┘    └────────────────────┘    └──────────────────┘
       2 hours                  90 days                  90 days
```

Keep a lot for a short time, and a little, the right little, for a long time.

## Pages

| Page | Read it when you need to know |
|---|---|
| [architecture.md](architecture.md) | the layers, what each stores, and how a record flows through them |
| [evidence-classes.md](evidence-classes.md) | the 13 kinds of evidence a diagnosis needs, and which layer keeps each |
| [budgets.md](budgets.md) | the storage each layer costs, modelled vs measured, and how to retune it |
| [qa-battery.md](qa-battery.md) | how the 92-issue battery works, how to run it and how to add an issue |
| [activity-ui.md](activity-ui.md) | why the current Activity screen hangs, and the requirements for the new one |
| [activity-ui-design-v2.md](activity-ui-design-v2.md) | the approved Activity design: behaviour, data sources and rejected ideas the mockup cannot show |
| [activity-ui-design.md](activity-ui-design.md) | the previous design, superseded by v2 (history only) |
| [development-database.md](development-database.md) | how development runs against a copy of the data, never the live file |
| [rollout.md](rollout.md) | the delivery stages, their status and the coordination with mobile |

## Data

- `data/resolved-issues.json`: the 92 resolved issues the battery replays. Each one lists the evidence it
  needed, how late it was investigated and whether it recurs.

## Vocabulary

- **Recorder**: the short, complete buffer that is overwritten after 2 hours.
- **Incident**: a pinned recorder window, kept for 90 days, grouped by fingerprint.
- **Fingerprint**: what makes two failures "the same problem": kind, route template and status or error code.
- **Ledger**: the long, thin record: write journal, events, hourly rollup and response versions.
- **Response version**: one distinct response body for a route, stored once and referenced by every
  response that returned it.
