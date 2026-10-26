// Package store implements Bridge's native SQLite persistence codec and
// orchestration for anime state (decode, merge, and save into
// anime_snapshots). It retains the historical NeDB-shaped JSON storage
// format (Spanish keys) for byte-compat with already-persisted rows; there
// is no external Legacy consumer left (SDD-55).
package store
