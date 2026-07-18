package legacy

import "errors"

type appendFailureKind string

const (
	appendFailureDefinite  appendFailureKind = "definite"
	appendFailureAmbiguous appendFailureKind = "ambiguous"
)

type appendError struct {
	kind appendFailureKind
	err  error
}

func (e *appendError) Error() string {
	return e.err.Error()
}

func (e *appendError) Unwrap() error {
	return e.err
}

// NewDefiniteAppendError marks a failure that happened before any bytes could
// have been appended, so its staged operation can be safely aborted.
func NewDefiniteAppendError(err error) error {
	return newAppendError(appendFailureDefinite, err)
}

// NewAmbiguousAppendError marks a failure where the effective file may already
// contain some or all of the intended append and recovery evidence must remain.
func NewAmbiguousAppendError(err error) error {
	return newAppendError(appendFailureAmbiguous, err)
}

// IsDefiniteAppendError reports whether no bytes could have been appended yet.
func IsDefiniteAppendError(err error) bool {
	return appendErrorHasKind(err, appendFailureDefinite)
}

// IsAmbiguousAppendError reports whether the append may have partially succeeded.
func IsAmbiguousAppendError(err error) bool {
	return appendErrorHasKind(err, appendFailureAmbiguous)
}

// newAppendError creates an append error with the supplied failure classification.
func newAppendError(kind appendFailureKind, err error) error {
	if err == nil {
		return nil
	}
	return &appendError{kind: kind, err: err}
}

// appendErrorHasKind reports whether an error carries the supplied append classification.
func appendErrorHasKind(err error, kind appendFailureKind) bool {
	var classified *appendError
	return errors.As(err, &classified) && classified.kind == kind
}
