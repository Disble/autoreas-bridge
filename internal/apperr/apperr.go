// Package apperr is the failure vocabulary of the driving adapters (ADR-032 §2).
//
// A failure carries one Code from a closed set; error-codes.json in this folder
// is the same set for the frontend, and tests on both sides compare against it.
// Outcomes such as applied, no_op and conflict are successful results, never
// codes. Domains keep their own sentinel errors; only driving adapters
// (internal/desktop, later internal/api) map them to a code.
//
// Bindings build invalid_argument, not_found and internal failures with the
// constructors below. There is deliberately no constructor for unavailable or
// failed_precondition: those describe module readiness, and only the module
// handles in internal/modules produce them, through their own unexported error
// type that satisfies Coded. CodeOf honours those two codes only from a type
// declared in internal/modules, so another package cannot forge them.
package apperr

import (
	"errors"
	"reflect"
	"slices"
)

// Code names one kind of failure. Its values travel to the frontend unchanged.
type Code string

const (
	// CodeUnavailable means the module is still starting; the caller may retry.
	CodeUnavailable Code = "unavailable"
	// CodeFailedPrecondition means the module failed to start; retrying will not help.
	CodeFailedPrecondition Code = "failed_precondition"
	// CodeInvalidArgument means the request itself is wrong.
	CodeInvalidArgument Code = "invalid_argument"
	// CodeNotFound means the requested record does not exist.
	CodeNotFound Code = "not_found"
	// CodeInternal means anything else went wrong; it renders as an error, never as empty.
	CodeInternal Code = "internal"
)

// codes is the closed set, in the order error-codes.json lists it.
var codes = []Code{CodeUnavailable, CodeFailedPrecondition, CodeInvalidArgument, CodeNotFound, CodeInternal}

// Coded is an error that carries a failure code.
type Coded interface {
	error
	Code() Code
}

// codedError is the error the exported constructors build.
type codedError struct {
	code    Code
	message string
	cause   error
}

// Error returns the message the frontend shows.
func (e *codedError) Error() string { return e.message }

// Code returns the failure code.
func (e *codedError) Code() Code { return e.code }

// Unwrap exposes the cause, so errors.Is still finds a domain sentinel.
func (e *codedError) Unwrap() error { return e.cause }

// Codes returns every failure code.
func Codes() []Code { return slices.Clone(codes) }

// readinessProducer is the only package whose errors may carry a readiness code.
const readinessProducer = "autoreas-bridge/internal/modules"

// CodeOf returns the code err carries, looking through wrapping. An error with
// no code, or with a code outside the closed set, has none. A readiness code
// (unavailable, failed_precondition) counts only from an error type declared in
// internal/modules; claimed by any other type it reads as internal, so a binding
// cannot make a failure look like a module that is merely starting.
func CodeOf(err error) (Code, bool) {
	var coded Coded
	if !errors.As(err, &coded) || !slices.Contains(codes, coded.Code()) {
		return "", false
	}
	code := coded.Code()
	if (code == CodeUnavailable || code == CodeFailedPrecondition) && declaredIn(coded) != readinessProducer {
		return CodeInternal, true
	}
	return code, true
}

// declaredIn returns the import path of the package that declares value's type,
// looking through one pointer.
func declaredIn(value any) string {
	typ := reflect.TypeOf(value)
	if typ.Kind() == reflect.Pointer {
		typ = typ.Elem()
	}
	return typ.PkgPath()
}

// InvalidArgument reports a request the binding cannot accept.
func InvalidArgument(message string) error {
	return &codedError{code: CodeInvalidArgument, message: message}
}

// NotFound reports a record that does not exist.
func NotFound(message string) error {
	return &codedError{code: CodeNotFound, message: message}
}

// Internal reports an unexpected failure. The message is the cause's, and the
// cause stays reachable through errors.Is and errors.As.
func Internal(cause error) error {
	if cause == nil {
		return &codedError{code: CodeInternal, message: "internal error"}
	}
	return &codedError{code: CodeInternal, message: cause.Error(), cause: cause}
}

// OrInternal returns err unchanged when it carries a code, nil for nil, and
// otherwise err as an internal failure.
func OrInternal(err error) error {
	if err == nil {
		return nil
	}
	if _, ok := CodeOf(err); ok {
		return err
	}
	return Internal(err)
}
