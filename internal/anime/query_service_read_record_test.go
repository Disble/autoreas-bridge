package anime_test

import (
	"context"
	"testing"

	"autoreas-bridge/internal/anime"
	"autoreas-bridge/internal/anime/domain"
)

func TestQueryServiceReadRecordsExposeOnlyEnglishGatewayProjection(t *testing.T) {
	t.Parallel()

	store := openAnimeServiceTestStore(t)
	seedAnimeSnapshotWithModifiedAt(t, store, "english-read", `{"_id":"english-read","nombre":"English","nrocapvisto":5,"activo":true,"pagina":"https://example.invalid/read","dias":[{"dia":"Ver hoy","orden":4}]}`, 19)
	service := anime.NewQueryService(store)

	got, err := service.ListReadRecords(context.Background())
	if err != nil {
		t.Fatalf("list English read records: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("record count = %d, want 1", len(got))
	}
	record := got[0]
	if record.Snapshot.ModifiedAt != 19 || record.Value.ID != "english-read" || record.Value.Title != "English" {
		t.Fatalf("unexpected record: %+v", record)
	}
	if record.Value.Active != domain.TriStateTrue || record.Value.SourceURL == nil || *record.Value.SourceURL != "https://example.invalid/read" {
		t.Fatalf("unexpected English state: %+v", record.Value)
	}
	if len(record.Value.Days) != 1 || record.Value.Days[0].Day != "Ver hoy" || record.Value.Days[0].Order != 4 {
		t.Fatalf("unexpected English schedule: %+v", record.Value.Days)
	}

	single, err := service.GetReadRecord(context.Background(), "english-read")
	if err != nil {
		t.Fatalf("get English read record: %v", err)
	}
	if single.Value.Progress != 5 || single.Snapshot.ModifiedAt != 19 {
		t.Fatalf("unexpected single record: %+v", single)
	}
}
