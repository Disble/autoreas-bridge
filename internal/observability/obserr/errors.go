// Package obserr is the shared structured-failure envelope for every
// observability read tool (request capture and runtime events). One error
// schema for every tool means a client never has to handle two shapes.
package obserr

import "net/http"

// Error is the structured observability failure envelope shared by every
// read tool across the request-capture and runtime-event packages.
type Error struct {
	Code       string
	Message    string
	Retryable  bool
	HTTPStatus int
}

func (e Error) Error() string { return e.Message }

// Unavailable creates a retryable error for missing or unreachable resources.
func Unavailable(message string) Error {
	return Error{Code: "unavailable", Message: message, Retryable: true, HTTPStatus: http.StatusServiceUnavailable}
}

// SchemaMismatch creates a non-retryable error for schema/version mismatches.
func SchemaMismatch(message string) Error {
	return Error{Code: "schema_mismatch", Message: message, Retryable: false, HTTPStatus: http.StatusFailedDependency}
}

// InvalidParams creates a non-retryable error for bad tool parameters.
func InvalidParams(message string) Error {
	return Error{Code: "invalid_params", Message: message, Retryable: false, HTTPStatus: http.StatusBadRequest}
}

// Unsupported creates a non-retryable error for unsupported tool requests.
func Unsupported(message string) Error {
	return Error{Code: "unsupported", Message: message, Retryable: false, HTTPStatus: http.StatusMethodNotAllowed}
}
