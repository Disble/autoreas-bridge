package obserr

import (
	"net/http"
	"testing"
)

// TestUnavailableConstructorShape asserts Unavailable populates the exported
// Error struct fields identically to requestcapture's former unexported
// unavailableError constructor.
func TestUnavailableConstructorShape(t *testing.T) {
	t.Parallel()

	err := Unavailable("resource down")
	want := Error{Code: "unavailable", Message: "resource down", Retryable: true, HTTPStatus: http.StatusServiceUnavailable}
	if err != want {
		t.Fatalf("expected %#v, got %#v", want, err)
	}
	if err.Error() != "resource down" {
		t.Fatalf("expected Error() to return the message, got %q", err.Error())
	}
}

// TestSchemaMismatchConstructorShape asserts SchemaMismatch populates the
// exported Error struct fields identically to the former schemaMismatchError.
func TestSchemaMismatchConstructorShape(t *testing.T) {
	t.Parallel()

	err := SchemaMismatch("schema mismatch")
	want := Error{Code: "schema_mismatch", Message: "schema mismatch", Retryable: false, HTTPStatus: http.StatusFailedDependency}
	if err != want {
		t.Fatalf("expected %#v, got %#v", want, err)
	}
}

// TestInvalidParamsConstructorShape asserts InvalidParams populates the
// exported Error struct fields identically to the former invalidParamsError.
func TestInvalidParamsConstructorShape(t *testing.T) {
	t.Parallel()

	err := InvalidParams("bad params")
	want := Error{Code: "invalid_params", Message: "bad params", Retryable: false, HTTPStatus: http.StatusBadRequest}
	if err != want {
		t.Fatalf("expected %#v, got %#v", want, err)
	}
}

// TestUnsupportedConstructorShape asserts Unsupported populates the exported
// Error struct fields identically to the former unsupportedError.
func TestUnsupportedConstructorShape(t *testing.T) {
	t.Parallel()

	err := Unsupported("not supported")
	want := Error{Code: "unsupported", Message: "not supported", Retryable: false, HTTPStatus: http.StatusMethodNotAllowed}
	if err != want {
		t.Fatalf("expected %#v, got %#v", want, err)
	}
}
