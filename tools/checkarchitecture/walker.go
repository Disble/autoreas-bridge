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

func walkArchitectureFiles(root string, source architectureFS, visit func(logicalPath string, content []byte) error) error {
	return walkArchitectureDir(root, root, source, map[string]bool{}, visit)
}

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
		logicalPath := filepath.Join(logicalDir, entry.Name())
		physicalPath := filepath.Join(physicalDir, entry.Name())
		if entry.IsDir() {
			if shouldSkipDir(logicalPath) {
				continue
			}
			if err := walkArchitectureDir(logicalPath, physicalPath, source, ancestors, visit); err != nil {
				return err
			}
			continue
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			info, statErr := source.Stat(physicalPath)
			if statErr != nil {
				if scannedExtensions[filepath.Ext(logicalPath)] {
					return statErr
				}
				continue
			}
			if info.IsDir() {
				if shouldSkipDir(logicalPath) {
					continue
				}
				target, evalErr := source.EvalSymlinks(physicalPath)
				if evalErr != nil {
					return evalErr
				}
				if err := walkArchitectureDir(logicalPath, target, source, ancestors, visit); err != nil {
					return err
				}
				continue
			}
		}
		if !scannedExtensions[filepath.Ext(logicalPath)] {
			continue
		}
		content, err := source.ReadFile(physicalPath)
		if err != nil {
			return err
		}
		if err := visit(logicalPath, content); err != nil {
			return err
		}
	}
	return nil
}

func canonicalArchitectureDir(path string) string {
	clean := filepath.Clean(path)
	if runtime.GOOS == "windows" {
		return strings.ToLower(clean)
	}
	return clean
}
