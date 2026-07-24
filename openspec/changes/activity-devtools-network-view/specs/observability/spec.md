# Delta for Observability

## MODIFIED Requirements

### Requirement: Dashboard Feed Stays Live

The frontend MUST display recent bridge log entries under a clearly-named "Events" view, separate from the Activity (Network transactions) view, and update the feed during the same application session without requiring manual refresh. Activity MUST NOT render `ObservabilityLogEntry` rows as if they were HTTP transactions.
(Previously: the log feed was shown under the "Activity"/Network-labeled route and its Status/Duration columns were always placeholders because log events are not HTTP transactions.)

#### Scenario: Dashboard shows buffered history
- GIVEN the Wails UI opens after backend activity already happened
- WHEN the Events view mounts
- THEN it MUST render the recent buffered `ObservabilityLogEntry` entries returned by the backend

#### Scenario: Dashboard receives new entries
- GIVEN the Events view is already mounted
- WHEN a new log-worthy backend event occurs
- THEN the new entry MUST appear in the feed during the active session
- AND existing entries MUST remain ordered and visible within retention limits

#### Scenario: Activity no longer mislabels the event log
- GIVEN a user opens the Activity route
- WHEN the route renders
- THEN it MUST show captured HTTP transactions (per `activity-network-transactions`), not `ObservabilityLogEntry` rows
- AND the event log MUST remain reachable from a separate, clearly-named "Events" route
