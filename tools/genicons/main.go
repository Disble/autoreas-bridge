package main

import (
	"bytes"
	"errors"
	"flag"
	"fmt"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
)

// masterPath is the single raster source every app icon derives from.
const masterPath = "build/appicon.png"

// iconTarget is one generated file and the sizes it carries.
type iconTarget struct {
	Path  string
	Sizes []int
}

// targets lists every icon the repository generates from the master.
//
// The Windows icon carries the full shell range because Explorer picks the
// nearest size and upscales when it has to; the tray only ever draws small.
var targets = []iconTarget{
	{Path: "build/windows/icon.ico", Sizes: []int{16, 24, 32, 48, 64, 128, 256}},
	{Path: "internal/tray/tray-icon.ico", Sizes: []int{16, 24, 32, 48}},
}

func main() {
	check := flag.Bool("check", false, "verify the generated icons match the master instead of writing them")
	flag.Parse()

	root, err := os.Getwd()
	if err != nil {
		_, _ = fmt.Fprintf(os.Stderr, "genicons: resolve working directory: %v\n", err)
		os.Exit(1)
	}

	if err := run(root, *check, os.Stdout, os.Stderr); err != nil {
		os.Exit(1)
	}
}

// run generates every icon target from the master, or verifies them in place.
func run(root string, check bool, stdout, stderr io.Writer) error {
	return runTargets(root, targets, check, stdout, stderr)
}

// runTargets is run against an explicit target list, so the failure paths stay
// reachable from a test without touching the repository's real icons.
func runTargets(root string, list []iconTarget, check bool, stdout, stderr io.Writer) error {
	master, err := loadMaster(root)
	if err != nil {
		_, _ = fmt.Fprintf(stderr, "genicons: read master icon %s: %v\n", masterPath, err)
		return err
	}

	var drifted []string
	for _, target := range list {
		want, err := encodeICO(master, target.Sizes)
		if err != nil {
			_, _ = fmt.Fprintf(stderr, "genicons: encode %s: %v\n", target.Path, err)
			return err
		}

		if check {
			if !matchesOnDisk(root, target, want) {
				drifted = append(drifted, target.Path)
			}
			continue
		}
		if err := writeTarget(root, target, want, stdout, stderr); err != nil {
			return err
		}
	}

	if len(drifted) > 0 {
		for _, path := range drifted {
			_, _ = fmt.Fprintf(stderr, "genicons: %s does not match %s\n", path, masterPath)
		}
		_, _ = fmt.Fprintf(stderr, "genicons: run `go run ./tools/genicons` to regenerate them\n")
		return errors.New("generated icons are out of date")
	}

	if check {
		_, _ = fmt.Fprintf(stdout, "genicons: %d icon targets match %s.\n", len(list), masterPath)
	}
	return nil
}

// matchesOnDisk reports whether the committed target already holds want.
//
// An unreadable target counts as a mismatch: a missing or corrupt icon needs
// regenerating for the same reason a stale one does.
func matchesOnDisk(root string, target iconTarget, want []byte) bool {
	got, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(target.Path)))
	return err == nil && bytes.Equal(got, want)
}

// writeTarget creates the target's directory if needed and writes the icon.
func writeTarget(root string, target iconTarget, want []byte, stdout, stderr io.Writer) error {
	path := filepath.Join(root, filepath.FromSlash(target.Path))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		_, _ = fmt.Fprintf(stderr, "genicons: create directory for %s: %v\n", target.Path, err)
		return err
	}
	if err := os.WriteFile(path, want, 0o644); err != nil {
		_, _ = fmt.Fprintf(stderr, "genicons: write %s: %v\n", target.Path, err)
		return err
	}
	_, _ = fmt.Fprintf(stdout, "genicons: wrote %s (%d sizes, %d bytes)\n",
		target.Path, len(target.Sizes), len(want))
	return nil
}

// loadMaster decodes the master PNG.
func loadMaster(root string) (image.Image, error) {
	file, err := os.Open(filepath.Join(root, filepath.FromSlash(masterPath)))
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	return png.Decode(file)
}
