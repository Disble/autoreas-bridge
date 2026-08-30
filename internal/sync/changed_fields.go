package sync

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
)

// deriveChangedFields returns the sorted set of top-level snapshot fields whose
// value differs between a committed write's base and desired snapshots.
//
// The set is DERIVED rather than declared on purpose. Producers used to be
// responsible for naming what they changed, and none of the six that publish an
// anime change ever did, so every changelog row recorded an empty list while
// real fields were being rewritten -- including a schedule wiped for six weeks.
// A declared list can be forgotten; a list computed from the two states in hand
// cannot. This runs inside the finalize transaction, the one place that holds
// both snapshots, which is why no producer signature needs to change.
//
// Comparison is deliberately shallow. The question this answers is "was this
// field part of the write", not "what moved inside it".
func deriveChangedFields(baseSnapshotJSON, desiredSnapshotJSON []byte) ([]string, error) {
	base, err := decodeChangedFieldsSnapshot(baseSnapshotJSON, "base")
	if err != nil {
		return nil, err
	}
	desired, err := decodeChangedFieldsSnapshot(desiredSnapshotJSON, "desired")
	if err != nil {
		return nil, err
	}

	changed := []string{}
	for field, baseValue := range base {
		if !reflect.DeepEqual(baseValue, desired[field]) {
			changed = append(changed, field)
		}
	}
	for field, desiredValue := range desired {
		if _, present := base[field]; present {
			continue
		}
		if !reflect.DeepEqual(nil, desiredValue) {
			changed = append(changed, field)
		}
	}

	sort.Strings(changed)
	return changed, nil
}

// decodeChangedFieldsSnapshot parses one stored snapshot, naming the side that
// failed so an unreadable row surfaces as an error instead of as "nothing
// changed".
func decodeChangedFieldsSnapshot(raw []byte, side string) (map[string]any, error) {
	var snapshot map[string]any
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, fmt.Errorf("read %s snapshot for changed-field derivation: %w", side, err)
	}
	return snapshot, nil
}
