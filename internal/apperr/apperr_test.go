package apperr_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"slices"
	"testing"

	"autoreas-bridge/internal/apperr"
	"autoreas-bridge/internal/lifecycle"
	"autoreas-bridge/internal/modules"
)

// foreignCoded is a coded error built outside the package, as the module handles build theirs.
type foreignCoded struct{ code apperr.Code }

func (e foreignCoded) Error() string     { return "foreign " + string(e.code) }
func (e foreignCoded) Code() apperr.Code { return e.code }

func TestCodesMatchTheSharedJSON(t *testing.T) {
	t.Parallel()
	raw, err := os.ReadFile("error-codes.json")
	if err != nil {
		t.Fatalf("read error-codes.json: %v", err)
	}
	var document struct {
		Codes []apperr.Code `json:"codes"`
	}
	if err := json.Unmarshal(raw, &document); err != nil {
		t.Fatalf("decode error-codes.json: %v", err)
	}
	if got := apperr.Codes(); !slices.Equal(slices.Sorted(slices.Values(got)), slices.Sorted(slices.Values(document.Codes))) || len(got) != 5 {
		t.Fatalf("Codes() = %v, error-codes.json = %v", got, document.Codes)
	}
}

func TestConstructorsCarryTheirCode(t *testing.T) {
	t.Parallel()
	cause := errors.New("disk full")
	cases := []struct {
		name    string
		err     error
		code    apperr.Code
		message string
	}{
		{"invalid argument", apperr.InvalidArgument("day must be 0-6"), apperr.CodeInvalidArgument, "day must be 0-6"},
		{"not found", apperr.NotFound("anime 7 not found"), apperr.CodeNotFound, "anime 7 not found"},
		{"internal", apperr.Internal(cause), apperr.CodeInternal, "disk full"},
		{"internal without cause", apperr.Internal(nil), apperr.CodeInternal, "internal error"},
		{"existing code kept", apperr.OrInternal(apperr.NotFound("gone")), apperr.CodeNotFound, "gone"},
		{"plain error becomes internal", apperr.OrInternal(cause), apperr.CodeInternal, "disk full"},
		{"wrapped code kept", apperr.OrInternal(fmt.Errorf("load: %w", apperr.InvalidArgument("bad"))), apperr.CodeInvalidArgument, "load: bad"},
		{"foreign code read", foreignCoded{apperr.CodeNotFound}, apperr.CodeNotFound, "foreign not_found"},
		{"forged unavailable is internal", foreignCoded{apperr.CodeUnavailable}, apperr.CodeInternal, "foreign unavailable"},
		{"forged failed precondition is internal", &foreignCoded{apperr.CodeFailedPrecondition}, apperr.CodeInternal, "foreign failed_precondition"},
		{"handle unavailable is honoured", handleFailure(false), apperr.CodeUnavailable, "episodes is starting"},
		{"handle failed precondition is honoured", fmt.Errorf("load: %w", handleFailure(true)), apperr.CodeFailedPrecondition, "load: database locked"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			code, ok := apperr.CodeOf(tc.err)
			if !ok || code != tc.code {
				t.Fatalf("CodeOf() = %q, %v; want %q, true", code, ok, tc.code)
			}
			if tc.err.Error() != tc.message {
				t.Fatalf("Error() = %q, want %q", tc.err.Error(), tc.message)
			}
		})
	}
}

func TestInternalKeepsItsCause(t *testing.T) {
	t.Parallel()
	cause := errors.New("disk full")
	if err := apperr.OrInternal(cause); !errors.Is(err, cause) {
		t.Fatalf("OrInternal(cause) does not wrap cause: %v", err)
	}
}

func TestOrInternalKeepsNil(t *testing.T) {
	t.Parallel()
	if err := apperr.OrInternal(nil); err != nil {
		t.Fatalf("OrInternal(nil) = %v, want nil", err)
	}
}

func TestCodeOfRejectsUncodedErrors(t *testing.T) {
	t.Parallel()
	for _, err := range []error{nil, errors.New("plain"), foreignCoded{"made_up"}} {
		if code, ok := apperr.CodeOf(err); ok || code != "" {
			t.Fatalf("CodeOf(%v) = %q, %v; want no code", err, code, ok)
		}
	}
}

// handleFailure returns the readiness failure a real module handle produces: unavailable while
// the module starts, failed_precondition once it failed.
func handleFailure(failed bool) error {
	registry, writer := lifecycle.New(nil)
	writer.Register("episodes")
	if failed {
		_ = writer.MarkFailed("episodes", "database locked")
	}
	_, err := modules.NewHandle[struct{}]("episodes", registry).Use(func(struct{}) (int, error) { return 0, nil })
	return err
}
