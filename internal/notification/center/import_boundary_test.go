package center

import (
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

// TestNotificationPackageGainsNoNewImport asserts internal/notification's own
// non-test dependency list is unchanged: it still imports internal/logger and
// never imports internal/download, internal/anime, internal/sync, or its own
// new center child package. Satisfies notification-center spec "The parent
// notification package gains no dependency."
func TestNotificationPackageGainsNoNewImport(t *testing.T) {
	t.Parallel()

	deps := goListDeps(t, "./internal/notification")

	if !containsDep(deps, "autoreas-bridge/internal/logger") {
		t.Fatalf("expected internal/notification to still import internal/logger, got deps %v", deps)
	}
	forbidden := []string{
		"autoreas-bridge/internal/download",
		"autoreas-bridge/internal/anime",
		"autoreas-bridge/internal/sync",
		"autoreas-bridge/internal/notification/center",
	}
	for _, dep := range forbidden {
		if containsDep(deps, dep) {
			t.Fatalf("expected internal/notification to never import %s, got deps %v", dep, deps)
		}
	}
}

// TestCenterPackageNeverImportsDownload asserts internal/notification/center's
// non-test dependency list never contains internal/download -- the forbidden
// import cycle this design exists to avoid. Satisfies notification-center
// spec "The service package never imports the download package."
func TestCenterPackageNeverImportsDownload(t *testing.T) {
	t.Parallel()

	deps := goListDeps(t, "./internal/notification/center")

	if containsDep(deps, "autoreas-bridge/internal/download") {
		t.Fatalf("expected internal/notification/center to never import internal/download, got deps %v", deps)
	}
}

// TestCenterSchemaOnlyImportsPersistence completes 1.1.1's schema test: it
// asserts centerschema's only internal dependency is internal/persistence,
// keeping the schema leaf acyclic. Satisfies notification-center spec "The
// schema leaf package has exactly one internal dependency."
func TestCenterSchemaOnlyImportsPersistence(t *testing.T) {
	t.Parallel()

	deps := goListDeps(t, "./internal/notification/centerschema")

	var internalDeps []string
	for _, dep := range deps {
		if dep == "autoreas-bridge/internal/notification/centerschema" {
			continue // go list -deps includes the queried package itself
		}
		if strings.HasPrefix(dep, "autoreas-bridge/") {
			internalDeps = append(internalDeps, dep)
		}
	}
	if len(internalDeps) != 1 || internalDeps[0] != "autoreas-bridge/internal/persistence" {
		t.Fatalf("expected centerschema's only internal dependency to be internal/persistence, got %v", internalDeps)
	}
}

// goListDeps runs `go list -deps` for pkg from the module root and returns
// the resulting import list. go list -deps includes the queried package
// itself in the result.
func goListDeps(t *testing.T, pkg string) []string {
	t.Helper()
	cmd := exec.Command("go", "list", "-deps", pkg)
	cmd.Dir = moduleRoot(t)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("go list -deps %s: %v", pkg, err)
	}
	return strings.Fields(string(out))
}

// moduleRoot resolves this module's root directory via `go env GOMOD`, so the
// `go list -deps` calls above work regardless of the test binary's working
// directory.
func moduleRoot(t *testing.T) string {
	t.Helper()
	out, err := exec.Command("go", "env", "GOMOD").Output()
	if err != nil {
		t.Fatalf("go env GOMOD: %v", err)
	}
	return filepath.Dir(strings.TrimSpace(string(out)))
}

// containsDep reports whether want appears in deps.
func containsDep(deps []string, want string) bool {
	return slices.Contains(deps, want)
}
