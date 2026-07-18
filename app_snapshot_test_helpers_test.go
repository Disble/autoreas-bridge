package main

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"testing"

	"autoreas-bridge/internal/anime"
)

// stubAppBridgeNativeRegistry is the app-level test double for
// anime.BridgeNativeRegistry (SDD-48), mirroring stubAppStore's shape.
type stubAppBridgeNativeRegistry struct {
	owned     map[string]struct{}
	registers []string
}

func (s *stubAppBridgeNativeRegistry) ListOwnedIDs(context.Context) (map[string]struct{}, error) {
	return s.owned, nil
}

func (s *stubAppBridgeNativeRegistry) RegisterOwned(_ context.Context, animeID string) error {
	s.registers = append(s.registers, animeID)
	return nil
}

type stubAppStore struct{}

func (stubAppStore) ListSnapshots(context.Context) (map[string]anime.SnapshotRecord, error) {
	return nil, nil
}

func (stubAppStore) ReplaceBaseline(context.Context, map[string]anime.SnapshotRecord, []string) error {
	return nil
}

// seedRuntimeAnimeSnapshot stores one runtime anime snapshot for tests.
func seedRuntimeAnimeSnapshot(t *testing.T, store anime.SnapshotStore, animeID string, payload string, modifiedAt int64) {
	t.Helper()
	hashBytes := md5.Sum([]byte(payload))
	if err := store.ReplaceBaseline(context.Background(), map[string]anime.SnapshotRecord{
		animeID: {
			AnimeID:       animeID,
			CanonicalJSON: []byte(payload),
			Hash:          hex.EncodeToString(hashBytes[:]),
			ModifiedAt:    modifiedAt,
		},
	}, nil); err != nil {
		t.Fatalf("seed runtime anime snapshot: %v", err)
	}
}

// isHex32 reports whether a string is a lowercase 32-character hexadecimal value.
func isHex32(s string) bool {
	if len(s) != 32 {
		return false
	}
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}
