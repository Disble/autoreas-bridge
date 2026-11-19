package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// bindingFile is the desktop source path every binding fixture is written to.
const bindingFile = "internal/desktop/app_fixture.go"

// desktopSource wraps fixture declarations in the desktop package.
func desktopSource(declarations string) string {
	return "package desktop\n\n" + declarations + "\n"
}

// baselineYAML builds a baseline document with the given entry lines.
func baselineYAML(entries ...string) string {
	return "version: 1\nviolations:\n" + strings.Join(entries, "\n") + "\n"
}

// entry builds one baseline entry for the fixture file.
func entry(rule, symbol string) string {
	return "  - rule: " + rule + "\n    file: " + bindingFile + "\n    symbol: " + symbol
}

// TestBindingRules covers both binding rules and their baseline over run(): each
// row writes one desktop fixture and, optionally, a baseline, then lists the
// fragments the failure must contain (none means the tree passes).
func TestBindingRules(t *testing.T) {
	t.Parallel()

	const useHandle = "func (a *App) GetThing() (Thing, error) { return a.modules.anime.Use(get) }"
	cases := []struct {
		name     string
		path     string
		source   string
		baseline string
		want     []string
	}{
		{
			name:   "binding without a handle is rejected",
			source: "func (a *App) GetThing() (Thing, error) { return a.svc.Get() }",
			want:   []string{bindingFile + ": App.GetThing", "[binding-uses-handle]", "modules.Handle.Use", "skill bridge-data", "ADR-032"},
		},
		{name: "binding through a module handle passes", source: useHandle},
		{name: "explicitly instantiated Use passes", source: "func (a *App) GetThing() (Thing, error) { return a.modules.anime.Use[Thing](get) }"},
		{name: "use inside a closure with no result passes", source: "func (a *App) Run() { go func() { _, _ = a.modules.shell.Use(log) }() }"},
		{
			name:   "a plain Use function is not a handle",
			source: "func (a *App) GetThing() (Thing, error) { return Use(get) }",
			want:   []string{"App.GetThing", "[binding-uses-handle]"},
		},
		{
			name:   "a method merely named like Use is not a handle",
			source: "func (a *App) GetThing() (Thing, error) { return a.modules.anime.UseCache(get) }",
			want:   []string{"App.GetThing", "[binding-uses-handle]"},
		},
		{
			name:   "string status is rejected",
			source: `func (a *App) Save() string { _, _ = a.modules.anime.Use(save); return "ok" }`,
			want:   []string{"App.Save", "[binding-signature]", "apperr", "skill bridge-data", "ADR-032"},
		},
		{
			name:   "slice without error is rejected",
			source: "func (a *App) List() []Row { rows, _ := a.modules.anime.Use(list); return rows }",
			want:   []string{"App.List", "[binding-signature]"},
		},
		{
			name:   "string beside another value without error is rejected",
			source: "func (a *App) Pick() (bool, string) { _, _ = a.modules.anime.Use(pick); return false, \"\" }",
			want:   []string{"App.Pick", "[binding-signature]"},
		},
		{name: "slice with error passes", source: "func (a *App) List() ([]Row, error) { return a.modules.anime.Use(list) }"},
		{name: "string with error passes", source: "func (a *App) Name() (string, error) { return a.modules.anime.Use(name) }"},
		{
			name:   "string before another value without error is rejected",
			source: "func (a *App) Pick() (string, bool) { _, _ = a.modules.anime.Use(pick); return \"\", false }",
			want:   []string{"App.Pick", "[binding-signature]"},
		},
		{
			name:   "slice before a fixed array without error is rejected",
			source: "func (a *App) Page() ([]Row, [2]int) { _, _ = a.modules.anime.Use(page); return nil, [2]int{} }",
			want:   []string{"App.Page", "[binding-signature]"},
		},
		{name: "fixed array is not a slice", source: "func (a *App) Pair() [2]int { _, _ = a.modules.anime.Use(pair); return [2]int{} }"},
		{name: "struct without error passes", source: "func (a *App) Status() Snapshot { s, _ := a.modules.shell.Use(status); return s }"},
		{name: "unexported method is not a binding", source: `func (a *App) helper() string { return "" }`},
		{name: "method of another type is not a binding", source: `func (s *Server) Get() string { return "" }`},
		{name: "plain function is not a binding", source: `func Get() string { return "" }`},
		{name: "a receiver-less method is not a binding", source: `func () Get() string { return "" }`},
		{
			name:   "a binding after other declarations is still checked",
			source: "func helper() {}\n\nfunc (a *App) Get() (Thing, error) { return get() }",
			want:   []string{"App.Get", "[binding-uses-handle]"},
		},
		{
			name:   "value receiver is a binding",
			source: `func (a App) Get() string { return "" }`,
			want:   []string{"App.Get", "[binding-uses-handle]", "[binding-signature]"},
		},
		{name: "test file is out of scope", path: "internal/desktop/app_fixture_test.go", source: `func (a *App) Get() string { return "" }`},
		{name: "desktop subpackage is out of scope", path: "internal/desktop/sub/fixture.go", source: `func (a *App) Get() string { return "" }`},
		{name: "other package is out of scope", path: "internal/api/fixture.go", source: `func (a *App) Get() string { return "" }`},
		{name: "non-Go file is out of scope", path: "internal/desktop/notes.ts", source: `func (a *App) Get() string { return "" }`},
		{
			name:   "unparsable desktop file is reported",
			source: "func (a *App) Get() string {",
			want:   []string{bindingFile, "cannot be parsed to check bindings"},
		},
		{
			name:     "baselined violations pass",
			source:   `func (a *App) Get() string { return "" }`,
			baseline: baselineYAML(entry("binding-uses-handle", "Get"), entry("binding-signature", "Get")),
		},
		{
			name:     "a baseline entry covers only its own rule",
			source:   `func (a *App) Get() string { return "" }`,
			baseline: baselineYAML(entry("binding-uses-handle", "Get")),
			want:     []string{"App.Get", "[binding-signature]"},
		},
		{
			name:     "a baseline entry covers only its own file",
			source:   `func (a *App) Get() string { return "" }`,
			baseline: baselineYAML(strings.Replace(entry("binding-signature", "Get"), bindingFile, "internal/desktop/app_other.go", 1), entry("binding-uses-handle", "Get")),
			want:     []string{"App.Get", "[binding-signature]", "stale baseline entry"},
		},
		{
			name:     "a stale entry fails and names itself",
			source:   useHandle,
			baseline: baselineYAML(entry("binding-signature", "Gone")),
			want:     []string{"stale baseline entry", "{rule: binding-signature, file: " + bindingFile + ", symbol: Gone}", "delete", "skill bridge-data", "ADR-032"},
		},
		{
			name:     "a duplicate entry is rejected",
			source:   `func (a *App) Get() (Thing, error) { return get() }`,
			baseline: baselineYAML(entry("binding-uses-handle", "Get"), entry("binding-uses-handle", "Get")),
			want:     []string{"duplicate baseline entry", "symbol: Get"},
		},
		{
			name:     "an unknown baseline version is rejected",
			source:   useHandle,
			baseline: "version: 2\nviolations: []\n",
			want:     []string{"baseline.yaml", "version 2"},
		},
		{
			name:     "an unknown baseline field is rejected",
			source:   useHandle,
			baseline: "version: 1\nviolations:\n  - rule: binding-signature\n    file: x.go\n    method: Get\n",
			want:     []string{"baseline.yaml", "method"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			path := tc.path
			if path == "" {
				path = bindingFile
			}
			writeFile(t, root, path, desktopSource(tc.source))
			if tc.baseline != "" {
				writeFile(t, root, bindingBaselinePath, tc.baseline)
			}

			assertViolations(t, run(root), tc.want)
		})
	}
}

// assertViolations checks that err contains every wanted fragment, or is nil when none is wanted.
func assertViolations(t *testing.T, err error, want []string) {
	t.Helper()
	if len(want) == 0 {
		if err != nil {
			t.Fatalf("run() = %v, want no violation", err)
		}
		return
	}
	if err == nil {
		t.Fatalf("run() = nil, want a violation containing %q", want)
	}
	for _, fragment := range want {
		if !strings.Contains(err.Error(), fragment) {
			t.Fatalf("run() = %v\nwant it to contain %q", err, fragment)
		}
	}
}

func TestBindingBaselineCountIsPrinted(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeFile(t, root, bindingFile, desktopSource(`func (a *App) Get() string { return "" }
func (a *App) List() ([]Row, error) { return nil, nil }`))
	writeFile(t, root, bindingBaselinePath, baselineYAML(
		entry("binding-uses-handle", "Get"), entry("binding-signature", "Get"), entry("binding-uses-handle", "List")))
	var out bytes.Buffer

	if err := runReport(root, osArchitectureFS{}, &out); err != nil {
		t.Fatalf("runReport() = %v", err)
	}
	want := "binding baseline: 3 entries (binding-signature: 1, binding-uses-handle: 2)\n"
	if out.String() != want {
		t.Fatalf("output = %q, want %q", out.String(), want)
	}
}

func TestBindingBaselineReadFailureStopsTheCheck(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(bindingBaselinePath)), 0o755); err != nil {
		t.Fatal(err)
	}

	err := run(root)

	if err == nil || !strings.Contains(err.Error(), "read binding baseline") {
		t.Fatalf("run() = %v, want a baseline read failure", err)
	}
}
