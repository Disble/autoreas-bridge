package correlation

import (
	"context"
	"testing"
)

func TestRequestIDTravelsInTheContext(t *testing.T) {
	t.Parallel()

	ctx := WithRequestID(context.Background(), "req-1")
	if got := RequestIDFromContext(ctx); got != "req-1" {
		t.Fatalf("RequestIDFromContext = %q, want req-1", got)
	}
	if got := RequestIDFromContext(context.Background()); got != "" {
		t.Fatalf("RequestIDFromContext without an id = %q, want empty", got)
	}
}
