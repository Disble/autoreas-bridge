// Package mutation hosts the ooze entry point for staged Go mutation testing.
//
// The only other file here carries a `//go:build mutation` constraint, so
// without this untagged file the package would contain no Go files under the
// default build tags. golangci-lint treats that as a typechecking error
// ("build constraints exclude all Go files"), which fails the pre-commit gate.
//
// Drive the harness through `go run ./tools/mutationstaged`; see
// docs/mutation-testing.md.
package mutation
