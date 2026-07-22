package anime

import "testing"

func TestSelfEchoRegistryConsumeOnceAfterSuccessfulWrite(t *testing.T) {
	t.Parallel()

	registry := NewSelfEchoRegistry()
	payload := []byte(`{"id":"anime-1","name":"Own","episodesWatched":1}`)

	registry.Remember(payload)

	if !registry.ConsumeIfPresent(payload) {
		t.Fatal("expected watcher to consume successful write self-echo")
	}

	if registry.ConsumeIfPresent(payload) {
		t.Fatal("expected successful write self-echo to be consumed only once")
	}
}

func TestSelfEchoRegistryForgetRollsBackFailedWrite(t *testing.T) {
	t.Parallel()

	registry := NewSelfEchoRegistry()
	failedPayload := []byte(`{"id":"anime-1","name":"Local","episodesWatched":3}`)
	externalPayload := []byte(`{"id":"anime-1","name":"External","episodesWatched":4}`)

	registry.Remember(failedPayload)
	registry.Forget(failedPayload)

	if registry.ConsumeIfPresent(failedPayload) {
		t.Fatal("expected failed write self-echo to be rolled back")
	}

	if registry.ConsumeIfPresent(externalPayload) {
		t.Fatal("expected external payload to remain visible after rollback")
	}
}
