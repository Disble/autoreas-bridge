package legacy_test

import (
	"encoding/json"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
)

func TestLifecycleMutationsStayInsideLegacyAdapterAndPreserveUnknownFields(t *testing.T) {
	at := time.UnixMilli(1700000000123).UTC()
	payload := []byte(`{"_id":"anime-1","nombre":"Frieren","activo":true,"custom":{"keep":7}}`)

	deactivated, err := legacy.Deactivate(payload, at)
	if err != nil {
		t.Fatalf("Deactivate: %v", err)
	}
	assertLifecycleState(t, deactivated, domain.TriStateFalse, &at)
	assertUnknownObjectPreserved(t, deactivated)

	softDeleted, err := legacy.IsSoftDeleted(deactivated)
	if err != nil || !softDeleted {
		t.Fatalf("IsSoftDeleted(deactivated) = (%v, %v), want (true, nil)", softDeleted, err)
	}

	reactivated, err := legacy.Reactivate(deactivated)
	if err != nil {
		t.Fatalf("Reactivate: %v", err)
	}
	assertLifecycleState(t, reactivated, domain.TriStateTrue, nil)
	assertUnknownObjectPreserved(t, reactivated)
}

func TestLifecycleMutationsRejectMalformedLegacyPayload(t *testing.T) {
	malformed := []byte(`{"_id":`)
	if _, err := legacy.Deactivate(malformed, time.UnixMilli(1)); err == nil {
		t.Fatal("Deactivate malformed error = nil")
	}
	if _, err := legacy.Reactivate(malformed); err == nil {
		t.Fatal("Reactivate malformed error = nil")
	}
	if _, err := legacy.IsSoftDeleted(malformed); err == nil {
		t.Fatal("IsSoftDeleted malformed error = nil")
	}
}

func assertLifecycleState(t *testing.T, payload []byte, active domain.TriState, deletedAt *time.Time) {
	t.Helper()
	value, _, err := legacy.DecodeDomain(payload)
	if err != nil {
		t.Fatalf("DecodeDomain: %v", err)
	}
	if value.Active != active {
		t.Fatalf("Active = %v, want %v", value.Active, active)
	}
	if deletedAt == nil {
		if value.DeletedAt != nil {
			t.Fatalf("DeletedAt = %v, want nil", value.DeletedAt)
		}
		return
	}
	if value.DeletedAt == nil || !value.DeletedAt.Equal(*deletedAt) {
		t.Fatalf("DeletedAt = %v, want %v", value.DeletedAt, deletedAt)
	}
}

func assertUnknownObjectPreserved(t *testing.T, payload []byte) {
	t.Helper()
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(payload, &fields); err != nil {
		t.Fatalf("unmarshal output: %v", err)
	}
	if string(fields["custom"]) != `{"keep":7}` {
		t.Fatalf("custom = %s, want preserved object", fields["custom"])
	}
}
