package anime

import (
	"testing"

	"autoreas-bridge/internal/anime/domain"
	"autoreas-bridge/internal/anime/legacy"
)

func decodeAnimeDomainInternal(t *testing.T, payload []byte) domain.Anime {
	t.Helper()
	value, _, err := legacy.Decode(payload)
	if err != nil {
		t.Fatalf("decode anime payload: %v", err)
	}
	return value
}
