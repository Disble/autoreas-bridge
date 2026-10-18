// Package correlation carries the bridge request id through a context, so
// everything a request causes can be joined back to it (P3,
// docs/observability/architecture.md). It is a leaf package: any layer may
// import it without creating a cycle.
package correlation

import "context"

// requestIDKey is the context key for the bridge's own request id.
type requestIDKey struct{}

// WithRequestID returns ctx carrying the bridge request id.
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, requestIDKey{}, requestID)
}

// RequestIDFromContext returns the bridge request id carried by ctx, or "".
func RequestIDFromContext(ctx context.Context) string {
	requestID, _ := ctx.Value(requestIDKey{}).(string)
	return requestID
}
