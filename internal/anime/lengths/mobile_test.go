package lengths

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"autoreas-bridge/internal/anime/episodes"
	"autoreas-bridge/internal/api/contracts"
)

func TestAttachEpisodesJoinsEveryAnimeFromOneRead(t *testing.T) {
	t.Parallel()

	reader := &readerStub{durations: map[string][]episodes.Duration{
		"tv":    stored(1, 24*time.Minute, 2, 47*time.Minute),
		"movie": stored(1, 95*time.Minute),
	}}
	tv := &contracts.MobileAnime{ID: "tv", Kind: kindOf(TVKind)}
	movie := &contracts.MobileAnime{ID: "movie", Kind: kindOf(3)}
	unmeasured := &contracts.MobileAnime{ID: "unmeasured", Kind: kindOf(TVKind),
		Episodes: []contracts.EpisodeLength{{Episode: 9, Minutes: 1}}}

	if err := AttachEpisodes(context.Background(), reader, tv, movie, unmeasured); err != nil {
		t.Fatalf("attach: %v", err)
	}

	wantTV := []contracts.EpisodeLength{{Episode: 1, Minutes: 24}, {Episode: 2, Minutes: 47, Long: true}}
	if len(tv.Episodes) != 2 || tv.Episodes[0] != wantTV[0] || tv.Episodes[1] != wantTV[1] {
		t.Errorf("tv: want %v, got %v", wantTV, tv.Episodes)
	}
	if len(movie.Episodes) != 1 || movie.Episodes[0] != (contracts.EpisodeLength{Episode: 1, Minutes: 95}) {
		t.Errorf("a movie lists its runtime and is never long, got %v", movie.Episodes)
	}
	if unmeasured.Episodes != nil {
		t.Errorf("an anime with no stored duration has no episodes, got %v", unmeasured.Episodes)
	}
	if len(reader.asked) != 1 || len(reader.asked[0]) != 3 ||
		reader.asked[0][0] != "tv" || reader.asked[0][1] != "movie" || reader.asked[0][2] != "unmeasured" {
		t.Errorf("every anime must be joined from one read naming each of them, got %v", reader.asked)
	}
}

func TestAttachEpisodesReturnsAFailedRead(t *testing.T) {
	t.Parallel()

	reader := &readerStub{err: errors.New("database is closed")}
	anime := &contracts.MobileAnime{ID: "tv", Kind: kindOf(TVKind)}

	if err := AttachEpisodes(context.Background(), reader, anime); err == nil {
		t.Fatal("a failed read must be returned, never served as an anime without episodes")
	}
}

func TestAttachEpisodesWithNoAnimeReadsNothing(t *testing.T) {
	t.Parallel()

	reader := &readerStub{}
	if err := AttachEpisodes(context.Background(), reader); err != nil {
		t.Fatalf("attach: %v", err)
	}
	if len(reader.asked) != 0 {
		t.Errorf("no anime must not read the store, got %v", reader.asked)
	}
}

// TestEpisodesWireShape pins the JSON Mobile receives: the field and its keys, and its absence when
// an anime has no stored duration.
func TestEpisodesWireShape(t *testing.T) {
	t.Parallel()

	withEpisodes, err := json.Marshal(contracts.MobileAnime{ID: "tv",
		Episodes: []contracts.EpisodeLength{{Episode: 2, Minutes: 47, Long: true}}})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded map[string]json.RawMessage
	if err := json.Unmarshal(withEpisodes, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got := string(decoded["episodes"]); got != `[{"episode":2,"minutes":47,"long":true}]` {
		t.Errorf("wire shape: got %s", got)
	}

	without, err := json.Marshal(contracts.MobileAnime{ID: "tv"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	decoded = nil
	if err := json.Unmarshal(without, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, present := decoded["episodes"]; present {
		t.Errorf("an anime with no durations must omit the field, got %s", without)
	}
}
