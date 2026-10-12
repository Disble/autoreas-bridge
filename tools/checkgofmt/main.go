// Command checkgofmt fails when tracked Go files are not gofmt-formatted.
package main

import (
	"bytes"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// maxCommandLineBytes bounds the characters handed to one gofmt invocation.
//
// Windows caps a command line at roughly 32 KiB, and this repository passed 32,770 characters of Go
// paths in one call — except that the call never started, so the formatting gate failed with "The
// filename or extension is too long" instead of checking anything. The bound is deliberately far
// below the cap so quoting and the toolchain path still fit.
const maxCommandLineBytes = 8000

func main() {
	root, err := os.Getwd()
	if err != nil {
		fail("resolve working directory", err)
	}

	files, err := collectGoFiles(root)
	if err != nil {
		fail("collect Go files", err)
	}

	if len(files) == 0 {
		fmt.Println("No Go files found; skipping gofmt check.")
		return
	}

	unformatted, err := lint(root, files)
	if err != nil {
		fail("run gofmt -l", err)
	}

	if unformatted != "" {
		fmt.Fprintf(os.Stderr, "Unformatted Go files detected:\n%s\n", unformatted)
		os.Exit(1)
	}

	fmt.Println("Go formatting check passed.")
}

// lint runs gofmt over every file and returns the unformatted ones, one per line, in walk order.
//
// The files are checked in batches rather than in one call: the check must be able to grow with the
// repository instead of failing once the list of paths outgrows what an operating system will accept
// as arguments.
func lint(root string, files []string) (string, error) {
	unformatted := make([]string, 0)

	for _, batch := range batches(files, maxCommandLineBytes) {
		// NOSONAR go:S4036 -- gofmt has to come from the toolchain that is building
		// this repository, which is exactly what PATH resolves. It is a repo-owned
		// build tool run by the pre-commit gate, not shipped code, and there is no
		// absolute path for gofmt that holds across a developer machine and CI.
		cmd := exec.Command("gofmt", append([]string{"-l"}, batch...)...) // NOSONAR
		cmd.Dir = root
		output, err := cmd.CombinedOutput()
		if err != nil {
			return "", fmt.Errorf("%w (%s)", err, bytes.TrimSpace(output))
		}
		for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
			if line = strings.TrimSpace(line); line != "" {
				unformatted = append(unformatted, line)
			}
		}
	}

	return strings.Join(unformatted, "\n"), nil
}

// batches groups files so that no single invocation receives more characters than limit. A path
// longer than the limit still gets a batch of its own, so the split always terminates.
func batches(files []string, limit int) [][]string {
	groups := make([][]string, 0)
	current := make([]string, 0, len(files))
	size := 0

	for _, file := range files {
		// +1 accounts for the separator the argument list needs between two paths.
		if len(current) > 0 && size+len(file)+1 > limit {
			groups = append(groups, current)
			current = make([]string, 0, len(files))
			size = 0
		}
		current = append(current, file)
		size += len(file) + 1
	}

	if len(current) > 0 {
		groups = append(groups, current)
	}

	return groups
}

// collectGoFiles walks the repository and returns Go source paths.
func collectGoFiles(root string) ([]string, error) {
	files := make([]string, 0)

	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}

		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}

		if filepath.Ext(path) != ".go" {
			return nil
		}

		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}

		files = append(files, rel)
		return nil
	})

	return files, err
}

// fail writes a fatal formatting-check error and exits with failure.
func fail(context string, err error) {
	if err == nil {
		return
	}

	fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)
	os.Exit(1)
}
