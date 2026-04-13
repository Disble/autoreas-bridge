package api

import (
	"net/http"
	"time"

	"autoreas-bridge/internal/logger"
)

// statusRecorder wraps http.ResponseWriter to capture the status code.
type statusRecorder struct {
	http.ResponseWriter
	statusCode int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.statusCode = code
	r.ResponseWriter.WriteHeader(code)
}

// RequestLoggingMiddleware wraps an http.Handler to log every request with
// method, path, status, and duration. It uses warn level for 4xx and error for 5xx.
func RequestLoggingMiddleware(next http.Handler, log logger.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		rec := &statusRecorder{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rec, r)

		elapsed := time.Since(start)
		level := levelForStatus(rec.statusCode)

		log.Logf("api", level, logger.Fields{
			EventType:  "http.request",
			DurationMs: elapsed.Milliseconds(),
			Metadata: map[string]any{
				"method": r.Method,
				"path":   r.URL.Path,
				"status": rec.statusCode,
			},
		}, "%s %s %d", r.Method, r.URL.Path, rec.statusCode)
	})
}

func levelForStatus(code int) string {
	switch {
	case code >= 500:
		return logger.LevelError
	case code >= 400:
		return logger.LevelWarn
	default:
		return logger.LevelInfo
	}
}
