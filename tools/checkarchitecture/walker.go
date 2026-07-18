package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

type architectureFS interface {
	ReadDir(path string) ([]fs.DirEntry, error)
	ReadFile(path string) ([]byte, error)
	Stat(path string) (fs.FileInfo, error)
	EvalSymlinks(path string) (string, error)
}

type osArchitectureFS struct{}

func (osArchitectureFS) ReadDir(path string) ([]fs.DirEntry, error) { return os.ReadDir(path) }
func (osArchitectureFS) ReadFile(path string) ([]byte, error)       { return os.ReadFile(path) }
func (osArchitectureFS) Stat(path string) (fs.FileInfo, error)      { return os.Stat(path) }
func (osArchitectureFS) EvalSymlinks(path string) (string, error)   { return filepath.EvalSymlinks(path) }

// walkArchitectureFiles walks all Go source files starting from root, resolving
// logical paths relative to root and invoking visit for each discovered file body.
func walkArchitectureFiles(root string, source architectureFS, visit func(logicalPath string, content []byte) error) error {
	return walkArchitectureDir(root, root, source, map[string]bool{}, visit)
}

// walkArchitectureDir recursively visits entries in an architecture directory.
func walkArchitectureDir(logicalDir, physicalDir string, source architectureFS, ancestors map[string]bool, visit func(string, []byte) error) error {
	canonical, err := source.EvalSymlinks(physicalDir)
	if err != nil {
		return err
	}
	key := canonicalArchitectureDir(canonical)
	if ancestors[key] {
		return nil
	}
	ancestors[key] = true
	defer delete(ancestors, key)

	entries, err := source.ReadDir(physicalDir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if err := walkArchitectureEntry(logicalDir, physicalDir, source, ancestors, visit, entry); err != nil {
			return err
		}
	}
	return nil
}

// walkArchitectureEntry dispatches one directory entry to the proper visitor.
func walkArchitectureEntry(logicalDir string, physicalDir string, source architectureFS, ancestors map[string]bool, visit func(string, []byte) error, entry fs.DirEntry) error {
	logicalPath, physicalPath := architectureEntryPaths(logicalDir, physicalDir, entry)
	if entry.IsDir() {
		return walkArchitectureSubdir(logicalPath, physicalPath, source, ancestors, visit)
	}
	processed, err := walkArchitectureSymlink(logicalPath, physicalPath, source, ancestors, visit, entry)
	if err != nil || processed {
		return err
	}
	return visitArchitectureFile(logicalPath, physicalPath, source, visit)
}

// architectureEntryPaths derives logical and physical paths for an entry.
func architectureEntryPaths(logicalDir string, physicalDir string, entry fs.DirEntry) (string, string) {
	return filepath.Join(logicalDir, entry.Name()), filepath.Join(physicalDir, entry.Name())
}

// visitArchitectureFile reads and visits a scanned source file.
func visitArchitectureFile(logicalPath string, physicalPath string, source architectureFS, visit func(string, []byte) error) error {
	if !scannedExtensions[filepath.Ext(logicalPath)] {
		return nil
	}
	content, err := source.ReadFile(physicalPath)
	if err != nil {
		return err
	}
	return visit(logicalPath, content)
}

// walkArchitectureSubdir visits a directory unless policy excludes it.
func walkArchitectureSubdir(logicalPath string, physicalPath string, source architectureFS, ancestors map[string]bool, visit func(string, []byte) error) error {
	if shouldSkipDir(logicalPath) {
		return nil
	}
	return walkArchitectureDir(logicalPath, physicalPath, source, ancestors, visit)
}

// walkArchitectureSymlink follows an eligible directory symlink safely.
func walkArchitectureSymlink(logicalPath string, physicalPath string, source architectureFS, ancestors map[string]bool, visit func(string, []byte) error, entry fs.DirEntry) (bool, error) {
	if entry.Type()&fs.ModeSymlink == 0 {
		return false, nil
	}
	info, err := source.Stat(physicalPath)
	if err != nil {
		if scannedExtensions[filepath.Ext(logicalPath)] {
			return false, err
		}
		return true, nil
	}
	if !info.IsDir() {
		return false, nil
	}
	if shouldSkipDir(logicalPath) {
		return true, nil
	}
	target, err := source.EvalSymlinks(physicalPath)
	if err != nil {
		return false, err
	}
	return true, walkArchitectureDir(logicalPath, target, source, ancestors, visit)
}

// canonicalArchitectureDir normalizes a directory path for cycle detection.
func canonicalArchitectureDir(path string) string {
	clean := filepath.Clean(path)
	if runtime.GOOS == "windows" {
		return strings.ToLower(clean)
	}
	return clean
}
