package backup

import (
	"context"
	"fmt"
	"io"
	"time"
)

// exportFn streams one table group's rows as JSONL into w and reports how
// many records it wrote. Implementations run inside their own read
// transaction and MUST write one record at a time — nothing accumulates.
//
// The type is unexported on purpose. Owning packages never name it: they
// expose a plain function whose signature is identical, and assignment to
// Group.Export works because the underlying types match.
type exportFn func(ctx context.Context, w io.Writer) (recordCount int, err error)

// Group binds a bundle entry name to the function that fills it.
type Group struct {
	Name   string
	Export exportFn
}

// Export writes a backup bundle to dest: one data/{name}.jsonl entry per
// group, in slice order, followed by manifest.json written last. If any
// group's Export returns an error, Export returns it immediately and
// manifest.json is never written — the bundle is then not a partial bundle,
// it is not a bundle.
func Export(ctx context.Context, dest, bridgeVersion string, groups []Group) (err error) {
	bw, err := newBundleWriter(dest)
	if err != nil {
		return err
	}
	defer func() {
		if closeErr := bw.close(); err == nil {
			err = closeErr
		}
	}()

	contexts := make([]ContextEntry, 0, len(groups))
	for _, g := range groups {
		w, sum, entryErr := bw.createDataEntry(g.Name)
		if entryErr != nil {
			return fmt.Errorf("create entry for group %q: %w", g.Name, entryErr)
		}

		count, exportErr := g.Export(ctx, w)
		if exportErr != nil {
			return fmt.Errorf("export group %q: %w", g.Name, exportErr)
		}

		contexts = append(contexts, ContextEntry{Name: g.Name, RecordCount: count, SHA256: sum()})
	}

	// The manifest is the commit point: it goes in only after every data entry
	// is complete and hashed. An export that dies before this line leaves a zip
	// with no manifest, which ReadManifest rejects outright — unreadable rather
	// than half-readable.
	return bw.writeManifest(newManifest(bridgeVersion, time.Now().UTC().Format(time.RFC3339), contexts))
}
