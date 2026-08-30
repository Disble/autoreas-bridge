package main

import (
	"encoding/json"
	"fmt"
	"reflect"
)

// collectionFields are the stored-shape snapshot fields whose value is a
// collection a write can silently empty. The order is fixed so findings for one
// operation are reported deterministically.
var collectionFields = []string{"days", "genres", "studios"}

// Operation is one committed row of anime_write_operations, carrying the
// before/after snapshot pair the truncation check reads. Nothing here is
// derived at runtime: every field is already persisted at commit time.
type Operation struct {
	OperationID         string
	AnimeID             string
	CommittedAtMs       int64
	BaseSnapshotJSON    []byte
	DesiredSnapshotJSON []byte
}

// Finding reports one collection field a committed write emptied while the
// write's intent was some other field. It carries enough identity to serve
// directly as a recovery list entry.
type Finding struct {
	OperationID   string
	AnimeID       string
	Field         string
	CommittedAtMs int64
}

// Analyze runs the truncation check across every committed write operation.
//
// It refuses to report a clean run it did not actually perform: when no
// operation carries any field this check knows how to read, the database speaks
// a vocabulary this build does not — snapshots written before the English
// vocabulary migration name the schedule `dias`, not `days` — and scanning them
// for `days` finds nothing while the truncations are still there. Reporting
// "clean" in that case is the exact defect this check exists to catch, so it is
// an error instead.
func Analyze(operations []Operation) ([]Finding, error) {
	findings := []Finding{}
	recognised := 0

	for _, operation := range operations {
		base, err := decodeSnapshot(operation.BaseSnapshotJSON, "base")
		if err != nil {
			return nil, fmt.Errorf("operation %s: %w", operation.OperationID, err)
		}
		if carriesKnownCollection(base) {
			recognised++
		}

		operationFindings, err := DetectTruncations(operation)
		if err != nil {
			return nil, err
		}
		findings = append(findings, operationFindings...)
	}

	if len(operations) > 0 && recognised == 0 {
		return nil, fmt.Errorf(
			"scanned %d committed write operation(s) and none carried any of %v: "+
				"this database predates the English vocabulary migration, so the check cannot read it",
			len(operations), collectionFields)
	}
	return findings, nil
}

// carriesKnownCollection reports whether a snapshot names at least one field
// this check knows how to inspect.
func carriesKnownCollection(snapshot map[string]any) bool {
	for _, field := range collectionFields {
		if _, present := snapshot[field]; present {
			return true
		}
	}
	return false
}

// DetectTruncations reports collection fields that went from non-empty to empty
// in a committed write whose intent was some other field.
//
// Intent is inferred structurally, because a committed write does not yet
// record which fields it meant to change: when the emptied collection is the
// ONLY difference between the two snapshots, emptying it was the point of the
// write and is not reported. When some other field also changed, the emptied
// collection is collateral damage and is reported.
//
// SDD-64 slice B replaces this inference with the derived changed-field set,
// which is exact. This function's contract does not change when it does.
func DetectTruncations(operation Operation) ([]Finding, error) {
	base, err := decodeSnapshot(operation.BaseSnapshotJSON, "base")
	if err != nil {
		return nil, fmt.Errorf("operation %s: %w", operation.OperationID, err)
	}
	desired, err := decodeSnapshot(operation.DesiredSnapshotJSON, "desired")
	if err != nil {
		return nil, fmt.Errorf("operation %s: %w", operation.OperationID, err)
	}

	truncated := truncatedCollections(base, desired)
	if len(truncated) == 0 {
		return nil, nil
	}
	if !changedOutside(base, desired, truncated) {
		return nil, nil
	}

	findings := make([]Finding, 0, len(truncated))
	for _, field := range collectionFields {
		if !truncated[field] {
			continue
		}
		findings = append(findings, Finding{
			OperationID:   operation.OperationID,
			AnimeID:       operation.AnimeID,
			Field:         field,
			CommittedAtMs: operation.CommittedAtMs,
		})
	}
	return findings, nil
}

// decodeSnapshot parses one stored snapshot into a comparable map, naming the
// side that failed so a malformed row is actionable rather than silently
// counting as "no truncation found".
func decodeSnapshot(raw []byte, side string) (map[string]any, error) {
	var snapshot map[string]any
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, fmt.Errorf("%s snapshot is not readable JSON: %w", side, err)
	}
	return snapshot, nil
}

// truncatedCollections returns the collection fields present and non-empty in
// base that are present and empty in desired. A field absent from either side
// is not a truncation: absent and emptied are different facts, and treating
// them alike would report every anime that never carried the field.
func truncatedCollections(base, desired map[string]any) map[string]bool {
	truncated := make(map[string]bool, len(collectionFields))
	for _, field := range collectionFields {
		baseItems, baseOK := base[field].([]any)
		desiredItems, desiredOK := desired[field].([]any)
		if !baseOK || !desiredOK {
			continue
		}
		if len(baseItems) > 0 && len(desiredItems) == 0 {
			truncated[field] = true
		}
	}
	return truncated
}

// changedOutside reports whether any field other than the truncated ones
// differs between the two snapshots. That difference is the write's real
// intent, and its presence is what separates collateral damage from a
// deliberate clear.
func changedOutside(base, desired map[string]any, truncated map[string]bool) bool {
	for field, baseValue := range base {
		if truncated[field] {
			continue
		}
		if !reflect.DeepEqual(baseValue, desired[field]) {
			return true
		}
	}
	for field, desiredValue := range desired {
		if truncated[field] {
			continue
		}
		if _, present := base[field]; present {
			continue
		}
		if desiredValue != nil {
			return true
		}
	}
	return false
}
