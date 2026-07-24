package mobilecapture

import (
	"encoding/json"
	"strings"
	"testing"

	"autoreas-bridge/internal/api/contracts"
	"autoreas-bridge/internal/device"
)

func TestSanitizerPatchAllowlistExcludesSensitiveMaterial(t *testing.T) {
	t.Parallel()

	status := 1
	episodes := 12.5
	lastWatchedAt := int64(1710000000123)
	base := int64(99)
	record := BuildPatchCaptureRecord(device.PairedDevice{DeviceID: "device-1", Name: "Phone", AuthToken: "secret-token"}, "anime-1", contracts.AnimePatch{
		Estado:           &status,
		NroCapVisto:      &episodes,
		FechaUltCapVisto: &lastWatchedAt,
		Dias:             []string{"monday"},
		Base:             &base,
	}, "accepted", 200, "")

	if record.Device.DeviceID != "device-1" || record.Device.Name != "Phone" {
		t.Fatalf("expected trusted device identity, got %#v", record.Device)
	}
	if _, ok := record.Payload["auth_token"]; ok {
		t.Fatalf("expected auth token to be excluded, got %#v", record.Payload)
	}
	for _, key := range []string{"status", "episodesWatched", "lastWatchedAt", "days", "base"} {
		if _, ok := record.Payload[key]; !ok {
			t.Fatalf("expected allowlisted key %q, got %#v", key, record.Payload)
		}
	}
}

func TestReconcileChangelogIDCorrelations(t *testing.T) {
	record := BuildReconcileCaptureRecord(device.PairedDevice{}, "reconcile", "/api/sync/reconcile", "http", contracts.ReconcileRequest{}, "accepted", nil, "", nil, []int64{41, 42})
	if got := record.Correlations.ChangelogIDs; len(got) != 2 || got[0] != 41 || got[1] != 42 {
		t.Fatalf("expected changelog ids [41 42], got %#v", got)
	}
	empty := BuildReconcileCaptureRecord(device.PairedDevice{}, "reconcile", "/api/sync/reconcile", "http", contracts.ReconcileRequest{}, "accepted", nil, "", nil, nil)
	encoded, err := json.Marshal(empty.Correlations)
	if err != nil {
		t.Fatalf("marshal correlations: %v", err)
	}
	if strings.Contains(string(encoded), "changelog_ids") {
		t.Fatalf("expected empty changelog ids to be omitted, got %s", encoded)
	}
}
