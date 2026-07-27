# Download Watcher — Unified Phases Design

## Overview

`awaitHosterOutcome` monitors a single hoster attempt from enqueue to completion. The watcher has four phases, with explicit states and minimal JD API calls.

## States

| State | Trigger | Event | Next Action |
|-------|---------|-------|-------------|
| **pending** | AddAndStart succeeded, no evidence yet | `DownloadEpisodePendingEvent` (optional) | FASE 1: wait for .part or JD signal |
| **checking** | 20s passed, 1st .part check failed | (same state) | Retry (2 more) |
| **downloading** | .part found OR JD confirmed alive | `DownloadEpisodeDownloadingEvent` | FASE 2: wait for video file |
| **completed** | Video file appears in folder | `DownloadEpisodeDownloadedEvent` | SUCCESS |
| **failed** | All hosters dead/timeout | `DownloadFailedEvent` | FAILED |

## Phases

```
awaitHosterOutcome(destination, baselineCount, firstHoster):

  ═══════════════════════════════════════════
  PRE-CHECK: JD already confirmed OFFLINE in crawl?
  ═══════════════════════════════════════════
  One JD API call BEFORE any wait.
  CrawlOfflineCount is a crawl-stage signal — it's determined
  before any download attempt. If JD already knows the links
  are dead, there's no point in the 60s grace period.

  status, err = PackageStatusByDestination(destination)

  if err == nil && CrawlOfflineCount > 0:
    → RemoveByDestination → DEAD (no wait)

  if err != nil:
    → JD unreachable, proceed to FASE 1 anyway

  ═══════════════════════════════════════════
  FASE 1 — 60s grace (filesystem only)
  ═══════════════════════════════════════════
  State: pending → checking → downloading
  No JD API calls. Only .part and video checks.
  3 attempts at 20s intervals = 60s total.

  sleep 20s

  for i = 0; i < 3; i++:
    video new? → completed → SUCCESS
    .part found?
      → publish DownloadEpisodeDownloadingEvent
      → state = downloading
      → FASE 2
    if i < 2: sleep 20s

  ═══════════════════════════════════════════
  FASE 1B — JD re-evaluation (after 60s)
  ═══════════════════════════════════════════
  60s without filesystem evidence.
  One more JD API call to re-evaluate.
  Links may have changed state during the grace period.

  status, err = PackageStatusByDestination(destination)

  if err:
    firstHoster → RemoveByDestination → DEAD
    fallback    → TIMEOUT

  verdict = classifyJDStatus(status)

  DEAD (OfflineCount > 0):
    → RemoveByDestination → DEAD → fallback

  ALIVE (OnlineCount > 0 or Running):
    → publish DownloadEpisodeDownloadingEvent
    → state = downloading
    → FASE 2

  UNMATCHED (no packages):
    firstHoster → RemoveByDestination → DEAD
    fallback    → TIMEOUT

  ═══════════════════════════════════════════
  FASE 2 — downloading → completed
  ═══════════════════════════════════════════
  State: downloading → completed
  Filesystem only, every 15s. No JD API calls.
  30-minute safety timeout.

  while not timed_out (30 min safety cap):
    video new?
      → Flatten (if in subfolder)
      → completed → SUCCESS
    sleep 15s

  → TIMEOUT
```

## Sequence Diagram

```
┌────────┐                                 ┌─────────────┐      ┌────────────┐
│ Bridge │                                 │ JDownloader │      │ Filesystem │
└────┬───┘                                 └──────┬──────┘      └──────┬─────┘
     │                                            │                    │
     │  PackageStatusByDestination(destination)   │                    │
     │────────────────────────────────────────────▶                    │
     │                                            │                    │
 ┌alt [CrawlOfflineCount > 0]──────────────────────────────────────────────┐
 │   │                                            │                    │   │
 │   │             OfflineCount > 0               │                    │   │
 │   ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│                    │   │
 │   │                                            │                    │   │
 │   │            RemoveByDestination             │                    │   │
 │   │────────────────────────────────────────────▶                    │   │
 │   │                                            │                    │   │
 │   ├╌╌╌┐                                        │                    │   │
 │   │   │ DEAD (sin esperar)                    │                    │   │
 │   ◀╌╌╌┘                                        │                    │   │
 └────────────────────────────────────────────────────────────────────────────┘
 │   │                                            │                    │   │
 ├[OnlineCount > 0 o sin respuesta]╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤
 │   │                                            │                    │   │
 │   ├───┐                                        │                    │   │
 │   │   │ Estado: pending                        │                    │   │
 │   ◀───┘                                        │                    │   │
 │   │                                            │                    │   │
 │   │                 ═══════════════════════     │                    │   │
 │   │                 │ FASE 1 — 60s gracia │     │                    │   │
 │   │                 ═══════════════════════     │                    │   │
 │   │                                            │                    │   │
 │   ├───┐                                        │                    │   │
 │   │   │ sleep 20s                              │                    │   │
 │   ◀───┘                                        │                    │   │
 │   │                                            │                    │   │
 │loop [i = 0..2, 3 intentos]─────────────────────────────────────────────│
 │   │                                            │                    │   │
 │   │                 video nuevo? (>baselineCount)                   │   │
 │   │─────────────────────────────────────────────────────────────────▶   │
 │   │                                            │                    │   │
 │alt [video encontrado]───────────────────────────────────────────────────│
 │   │                                            │                    │   │
 │   │                           SUCCESS          │                    │   │
 │   ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│   │
 │   │                                            │                    │   │
 │[no hay video]╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
 │   │                                            │                    │   │
 │   │                  hasPartFilesRecursive(folder)                  │   │
 │   │─────────────────────────────────────────────────────────────────▶   │
 │   │                                            │                    │   │
 │alt [.part encontrado]───────────────────────────────────────────────────│
 │   │                                            │                    │   │
 │   │                          .part existe      │                    │   │
 │   ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│   │
 │   │                                            │                    │   │
 │   ├───┐                                        │                    │   │
 │   │   │ DownloadEpisodeDownloadingEvent        │                    │   │
 │   ◀───┘                                        │                    │   │
 │   │                                            │                    │   │
 │   ├───┐                                        │                    │   │
 │   │   │ Estado: downloading                    │                    │   │
 │   ◀───┘                                        │                    │   │
 │   │                                            │                    │   │
 │   ├─→ FASE 2                                   │                    │   │
 │   │                                            │                    │   │
 │[no .part]╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
 │   │                                            │                    │   │
 │   ├───┐                                        │                    │   │
 │   │   │ sleep 20s (si i < 2)                   │                    │   │
 │   ◀───┘                                        │                    │   │
 │   │                                            │                    │   │
 │   │  ═══════════════════════════════════════    │                    │   │
 │   │  ═══ FASE 1B — Re-evaluación JD ═══════    │                    │   │
 │   │  ═══════════════════════════════════════    │                    │   │
 │   │                                            │                    │   │
 │   │  60s sin evidencia. Preguntamos a JD.      │                    │   │
 │   │                                            │                    │   │
 │   │  PackageStatusByDestination(destination)   │                    │   │
 │   │────────────────────────────────────────────▶   │                │   │
 │   │                                            │   │                │   │
 │alt [JD no responde]────────────────────────────────│                │   │
 │   │                                            │   │                │   │
 │   │                   error                    │   │                │   │
 │   ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│   │                │   │
 │   │                                            │   │                │   │
 │alt [firstHoster]───────────────────────────────────│                │   │
 │   │                                            │   │                │   │
 │   │            RemoveByDestination             │   │                │   │
 │   │────────────────────────────────────────────▶   │                │   │
 │   │                                            │   │                │   │
 │   ├╌╌╌┐                                        │   │                │   │
 │   │   │ DEAD                                  │   │                │   │
 │   ◀╌╌╌┘                                        │   │                │   │
 │   │                                            │   │                │   │
 │[fallback]╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│                │   │
 │   │                                            │   │                │   │
 │   ├╌╌╌┐                                        │   │                │   │
 │   │   │ TIMEOUT                               │   │                │   │
 │   ◀╌╌╌┘                                        │   │                │   │
 │   │                                            │   │                │   │
 │────────────────────────────────────────────────────│                │   │
 │   │                                            │   │                │   │
 │alt [DEAD (OfflineCount > 0)]───────────────────────│                │   │
 │   │                                            │   │                │   │
 │   │            RemoveByDestination             │   │                │   │
 │   │────────────────────────────────────────────▶   │                │   │
 │   │                                            │   │                │   │
 │   ├╌╌╌┐                                        │   │                │   │
 │   │   │ DEAD                                  │   │                │   │
 │   ◀╌╌╌┘                                        │   │                │   │
 │   │                                            │   │                │   │
 │[ALIVE (OnlineCount > 0 o Running)]╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│                │   │
 │   │                                            │   │                │   │
 │   ├───┐                                        │   │                │   │
 │   │   │ DownloadEpisodeDownloadingEvent        │   │                │   │
 │   ◀───┘                                        │   │                │   │
 │   │                                            │   │                │   │
 │   ├───┐                                        │   │                │   │
 │   │   │ Estado: downloading                    │   │                │   │
 │   ◀───┘                                        │   │                │   │
 │   │                                            │   │                │   │
 │   ├─→ FASE 2                                   │   │                │   │
 │   │                                            │   │                │   │
 │alt [UNMATCHED (sin paquetes)]──────────────────────│                │   │
 │   │                                            │   │                │   │
 │   ├[firstHoster]───┐                            │   │                │   │
 │   │   │   DEAD                                │   │                │   │
 │   │   ◀────────────┘                            │   │                │   │
 │   │                                            │   │                │   │
 │   ├[fallback]───┐                               │   │                │   │
 │   │   │   TIMEOUT                             │   │                │   │
 │   │   ◀───────────┘                             │   │                │   │
 │   │                                            │   │                │   │
 │   │          ══════════════════════════════════ │   │                │   │
 │   │          ═══ FASE 2 — downloading ═════════ │   │                │   │
 │   │          ══════════════════════════════════ │   │                │   │
 │   │                                            │   │                │   │
 ┌───────────────────────────┐                     │   │                │   │
 ││       Estado: downloading │                     │   │                │   │
 └───────────────────────────┘                     │   │                │   │
 │   │                                            │   │                │   │
 │loop [cada 15s, timeout 30 min]─────────────────────────────────────────│
 │   │                                            │                    │   │
 │   │                  CountRecursive + CountAtRoot                   │   │
 │   │─────────────────────────────────────────────────────────────────▶   │
 │   │                                            │                    │   │
 │alt [video nuevo en root]────────────────────────────────────────────────│
 │   │                                            │                    │   │
 │   │               Flatten (si archivos en subfolder)                │   │
 │   │─────────────────────────────────────────────────────────────────▶   │
 │   │                                            │                    │   │
 │   │                        video confirmado    │                    │   │
 │   ◀╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│   │
 │   │                                            │                    │   │
 │   ├╌╌╌┐                                        │                    │   │
 │   │   │ SUCCESS                               │                    │   │
 │   ◀╌╌╌┘                                        │                    │   │
 │   │                                            │                    │   │
 │[timeout (30 min safety cap)]╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌│
 │   │                                            │                    │   │
 │   ├╌╌╌┐                                        │                    │   │
 │   │   │ TIMEOUT                               │                    │   │
 │   ◀╌╌╌┘                                        │                    │   │
     │                                            │                    │
┌────┴───┐                                 ┌──────┴──────┐      ┌──────┴─────┐
│ Bridge │                                 │ JDownloader │      │ Filesystem │
└────────┘                                 └─────────────┘      └────────────┘
```

## Legend

| Symbol | Meaning |
|--------|---------|
| SUCCESS | Episode downloaded → `DownloadEpisodeDownloadedEvent` |
| DEAD | Hoster dead → fallback to next |
| TIMEOUT | Could not confirm → stop without fallback |
| `pending` | Waiting for download evidence (FASE 1) |
| `downloading` | .part seen or JD confirmed alive → `DownloadEpisodeDownloadingEvent` |

## Design Decisions

1. **JD API called twice per hoster (not per tick)**: PRE-CHECK and FASE 1B. FASE 2 has NO JD API calls — pure filesystem.

2. **`CrawlOfflineCount > 0` signals immediate DEAD**: This is a crawl-stage signal from `LinkGrabber.Packages()`. If JD determined links are OFFLINE during crawl, there's no point in the 60s grace period.

3. **60s grace covers the "online but dead" case**: Mediafire links were ONLINE in crawl (JD recognized the URL format) but the hoster failed at download time. The 60s .part check catches this without false positives.

4. **First vs fallback hoster distinction**: First hoster is aggressive (DEAD after failed checks). Fallback hosters are conservative (TIMEOUT instead of DEAD for uncertain cases, so JD has time to process links).

5. **No 30-minute timeout for alive hosters**: If JD confirms links are ONLINE/Running, the hoster stays in FASE 2 until the file appears. The 30-minute safety cap only protects against truly stuck downloads.
