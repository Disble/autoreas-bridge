package store

import (
	"context"
	"testing"
)

func TestGatewayReadContractsReturnEnglishDomainValues(t *testing.T) {
	t.Parallel()

	const payload = `{"_id":"read","nombre":"English Read","nrocapvisto":3,"activo":true,"pagina":"https://example.invalid/read","dias":[{"dia":"Ver hoy","orden":2}]}`
	gateway := NewGateway(GatewayConfig{
		LoadSnapshot: func(context.Context, string) (Snapshot, error) {
			return Snapshot{AnimeID: "read", CanonicalJSON: []byte(payload), ModifiedAt: 7}, nil
		},
		ListSnapshots: func(context.Context) (map[string]Snapshot, error) {
			return map[string]Snapshot{"read": {AnimeID: "read", CanonicalJSON: []byte(payload), ModifiedAt: 7}}, nil
		},
	})

	snapshot, value, err := gateway.Get(context.Background(), "read")
	if err != nil {
		t.Fatalf("get through Legacy gateway: %v", err)
	}
	if snapshot.ModifiedAt != 7 || value.Title != "English Read" || value.SourceURL == nil {
		t.Fatalf("unexpected English gateway read: snapshot=%+v value=%+v", snapshot, value)
	}

	records, err := gateway.List(context.Background())
	if err != nil {
		t.Fatalf("list through Legacy gateway: %v", err)
	}
	if len(records) != 1 || records[0].Snapshot.ModifiedAt != 7 || records[0].Anime.Title != "English Read" {
		t.Fatalf("unexpected English gateway list: %+v", records)
	}
}
