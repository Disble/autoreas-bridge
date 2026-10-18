package requestcapture

import (
	"context"
	"database/sql"

	"autoreas-bridge/internal/observability/activityread"
	obs "autoreas-bridge/internal/observability/requestcapture"
)

// Reader is the sidecar's read-only view of the bridge database: the
// Activity read service for the questions, and the capture reader for one
// request by key.
type Reader struct {
	path     string
	ro       *obs.ReadOnlyDB
	captures *obs.Reader
	activity *activityread.Reader
}

// OpenReader opens the bridge database at path in query-only mode. It fails
// closed when the file is missing or the capture schema is not recognized.
func OpenReader(path string) (*Reader, error) {
	ro, err := obs.OpenReadOnlyDB(path)
	if err != nil {
		return nil, err
	}
	return &Reader{path: path, ro: ro, captures: obs.NewReader(ro.DB()), activity: activityread.New(ro.DB())}, nil
}

// Path returns the database path the reader opened.
func (r *Reader) Path() string { return r.path }

// VerifyQueryOnly confirms the handle refuses writes.
func (r *Reader) VerifyQueryOnly(ctx context.Context) error { return r.ro.VerifyQueryOnly(ctx) }

// Close releases the database handle.
func (r *Reader) Close() error { return r.ro.Close() }

// db returns the shared query-only handle.
func (r *Reader) db() *sql.DB { return r.ro.DB() }
