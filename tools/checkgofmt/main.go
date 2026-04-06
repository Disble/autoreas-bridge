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

	cmd := exec.Command("gofmt", append([]string{"-l"}, files...)...)
	cmd.Dir = root
	output, err := cmd.CombinedOutput()
	if err != nil {
		fail(fmt.Sprintf("run gofmt -l: %s", bytes.TrimSpace(output)), err)
	}

	trimmed := strings.TrimSpace(string(output))
	if trimmed != "" {
		fmt.Fprintf(os.Stderr, "Unformatted Go files detected:\n%s\n", trimmed)
		os.Exit(1)
	}

	fmt.Println("Go formatting check passed.")
}

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

func fail(context string, err error) {
	if err == nil {
		return
	}

	fmt.Fprintf(os.Stderr, "%s: %v\n", context, err)
	os.Exit(1)
}
