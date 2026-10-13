// Package episodes owns each anime episode's stored duration
// (anime_episode_durations) and the per-anime announcement queue
// (durations_pending_announce) every duration write fills in the same
// transaction. A duration is episode data, not file tracking: rows carry no
// path or file identity and outlive the anime's folder. No other package may
// reference either table by name (enforced by tools/checkarchitecture).
package episodes

import "autoreas-bridge/internal/persistence"

const (
	// episodeDurationsDDL keeps one value per episode plus who wrote it
	// (analysis D0). The checks make whole episodes and positive durations a
	// schema guarantee, not only a validation rule.
	episodeDurationsDDL = `
		CREATE TABLE IF NOT EXISTS anime_episode_durations (
			anime_id      TEXT    NOT NULL,
			episode       INTEGER NOT NULL CHECK (episode >= 1),
			duration_ms   INTEGER NOT NULL CHECK (duration_ms > 0),
			source        TEXT    NOT NULL CHECK (source IN ('measured', 'manual')),
			updated_at_ms INTEGER NOT NULL,
			PRIMARY KEY (anime_id, episode)
		)`
	// pendingAnnounceDDL holds one row per anime whose durations changed and
	// have not been announced yet; the primary key groups any number of
	// episode writes into one announcement (analysis D6).
	pendingAnnounceDDL = `
		CREATE TABLE IF NOT EXISTS durations_pending_announce (
			anime_id     TEXT    PRIMARY KEY,
			marked_at_ms INTEGER NOT NULL
		)`
)

// SchemaTables returns the episode-duration table descriptors for the bridge
// schema registry. Both tables are create-only: no ColumnAdds and no Migrate.
func SchemaTables() []persistence.TableSchema {
	return []persistence.TableSchema{
		{Name: "anime_episode_durations", CreateDDL: episodeDurationsDDL},
		{Name: "durations_pending_announce", CreateDDL: pendingAnnounceDDL},
	}
}
