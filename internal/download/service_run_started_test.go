package download

import (
	"context"
	"reflect"
	"testing"

	"autoreas-bridge/internal/api/contracts"
)

// TestRunStartedLedgerEntryCarriesTheRunTrigger pins the metadata of the download.run_started
// entry on both entry points: the trigger that started the run, and for a single-anime run the
// anime it is about, so a kept ledger row is diagnosable without parsing its message.
func TestRunStartedLedgerEntryCarriesTheRunTrigger(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name         string
		run          func(*Service) error
		wantMessage  string
		wantMetadata map[string]any
	}{
		{
			name: "run once",
			run: func(s *Service) error {
				_, err := s.RunOnce(context.Background(), "schedule")
				return err
			},
			wantMessage:  "download run run-fixed started (trigger=schedule)",
			wantMetadata: map[string]any{"trigger": "schedule"},
		},
		{
			name: "run anime",
			run: func(s *Service) error {
				_, err := s.RunAnime(context.Background(), "manual_anime", contracts.MobileAnime{ID: "anime-1", Name: "Frieren", Active: 1})
				return err
			},
			wantMessage:  "download run run-fixed started (trigger=manual_anime, anime=Frieren)",
			wantMetadata: map[string]any{"trigger": "manual_anime", "animeName": "Frieren"},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			deps := baseDeps(t)
			recorder := &fieldsRecorder{}
			deps.Logger = recorder

			if err := test.run(NewService(deps)); err != nil {
				t.Fatalf("run: %v", err)
			}

			entry := recorder.only(t, "download.run_started")
			if entry.message != test.wantMessage {
				t.Fatalf("expected message %q, got %q", test.wantMessage, entry.message)
			}
			if !reflect.DeepEqual(entry.metadata, test.wantMetadata) {
				t.Fatalf("expected metadata %#v, got %#v", test.wantMetadata, entry.metadata)
			}
		})
	}
}
