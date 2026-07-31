package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// materializeIndex writes the current Git index into a temporary directory and
// returns its path plus a cleanup function.
//
// This is not an optimisation, it is what makes the guard usable at all.
// ooze's fsrepository.LinkAllToTemporaryRepository walks the repository root
// and calls os.Symlink for EVERY file, with no exclusions -- IgnoreSourceFiles
// filters which files get mutated, never which get linked. Against the working
// tree that means symlinking frontend/node_modules (~130k files) once per
// mutant, which is why an unscoped run never finishes.
//
// `git checkout-index` also gives the guard the right semantics for free: it
// materialises exactly the staged content, which is what a pre-commit gate is
// supposed to judge, rather than the working tree that merely resembles it.
func materializeIndex(root string) (string, func(), error) {
	sandbox, err := os.MkdirTemp("", "autoreas-mutation-")
	if err != nil {
		return "", nil, fmt.Errorf("create mutation sandbox: %w", err)
	}
	cleanup := func() { _ = os.RemoveAll(sandbox) }

	// The trailing separator is required: git treats --prefix as a literal
	// string prepended to each path, not as a directory.
	cmd := exec.Command("git", "checkout-index", "--all", "--prefix="+sandbox+string(os.PathSeparator))
	cmd.Dir = root
	if output, err := cmd.CombinedOutput(); err != nil {
		cleanup()
		return "", nil, fmt.Errorf("materialize index into %s: %w: %s", sandbox, err, output)
	}

	if err := stubEmbeddedFrontend(sandbox); err != nil {
		cleanup()
		return "", nil, err
	}
	return sandbox, cleanup, nil
}

// stubEmbeddedFrontend creates the frontend/dist entry that main.go embeds.
// The built assets are generated, so they are absent from the index and the
// root package would fail to build without them -- taking every mutant down
// with it whenever a root-level file is staged.
func stubEmbeddedFrontend(sandbox string) error {
	dist := filepath.Join(sandbox, "frontend", "dist")
	if err := os.MkdirAll(dist, 0o755); err != nil {
		return fmt.Errorf("create embedded frontend stub: %w", err)
	}
	index := filepath.Join(dist, "index.html")
	if err := os.WriteFile(index, []byte("<!doctype html>\n"), 0o644); err != nil {
		return fmt.Errorf("write embedded frontend stub: %w", err)
	}
	return nil
}
