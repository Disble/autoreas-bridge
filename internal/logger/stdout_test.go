package logger

import (
	"bytes"
	"strings"
	"testing"
)

func TestStdoutLoggerWritesDomainPrefixMessage(t *testing.T) {
	t.Parallel()

	var buffer bytes.Buffer
	logs := NewStdoutLogger(&buffer)
	logs.Infof("anime", "updated %s", "Bleach")

	got := strings.TrimSpace(buffer.String())
	if got != "anime: updated Bleach" {
		t.Fatalf("expected stdout format %q, got %q", "anime: updated Bleach", got)
	}
}
