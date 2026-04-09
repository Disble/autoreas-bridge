# Observability Specification

## Purpose

This specification defines shared bridge observability for terminal output and the Wails dashboard.

## Requirements

### Requirement: Shared Structured Logging

The system MUST provide a shared logging contract for bridge domains that produces normalized log entries with at least a domain, message, and timestamp.

#### Scenario: Terminal output remains human-readable
- GIVEN a bridge component records an operational event
- WHEN the shared logger writes to stdout
- THEN the rendered line MUST preserve the `domain: message` prefix style
- AND the message MUST be readable without frontend tooling

#### Scenario: Recent logs can be queried
- GIVEN log entries have been recorded
- WHEN a consumer requests recent logs
- THEN the system MUST return entries in newest-known buffer order
- AND the result MUST be bounded to in-memory retention

### Requirement: Domain Runtime Events Are Observable

The system MUST log meaningful runtime events for anime, sync, api, websocket, and system flows.

#### Scenario: Anime runtime activity is logged
- GIVEN startup catch-up, watcher, or writer activity occurs
- WHEN the component completes an important step or warning path
- THEN the logger MUST record an entry in the `anime` or `system` domain

#### Scenario: Sync and websocket propagation is logged
- GIVEN an `anime.changed` flow reaches sync or websocket boundaries
- WHEN downstream services react
- THEN the logger MUST record the receiving or forwarding action with the relevant domain prefix

### Requirement: Wails Exposes Recent Logs

The Wails app facade MUST expose recent in-memory log entries through a public binding.

#### Scenario: Frontend bootstraps dashboard state
- GIVEN the bridge has accumulated recent log entries
- WHEN the React frontend calls `GetRecentLogs()`
- THEN the method MUST return a serializable collection of log entries
- AND the call MUST NOT panic before or after startup completes

#### Scenario: Empty buffer is supported
- GIVEN no log entries have been recorded yet
- WHEN `GetRecentLogs()` is called
- THEN the method MUST return an empty collection

### Requirement: Dashboard Feed Stays Live

The frontend MUST display recent bridge log entries and update the feed during the same application session without requiring manual refresh.

#### Scenario: Dashboard shows buffered history
- GIVEN the Wails UI opens after backend activity already happened
- WHEN the observability panel mounts
- THEN it MUST render the recent buffered entries returned by the backend

#### Scenario: Dashboard receives new entries
- GIVEN the observability panel is already mounted
- WHEN a new log-worthy backend event occurs
- THEN the new entry MUST appear in the feed during the active session
- AND existing entries MUST remain ordered and visible within retention limits
