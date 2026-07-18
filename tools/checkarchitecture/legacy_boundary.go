// Package main validates source boundaries in the bridge architecture.
package main

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"regexp"
	"strings"
)

const legacyImportPath = "autoreas-bridge/internal/anime/legacy"

const legacyDomainImportPath = "autoreas-bridge/internal/anime/domain"

var canonicalGeneratedHeader = regexp.MustCompile(`^// Code generated .+ DO NOT EDIT\.$`)

var legacyDTOImplementationFiles = map[string]bool{
	"internal/anime/legacy/create.go":     true,
	"internal/anime/legacy/gateway.go":    true,
	"internal/anime/legacy/mapper.go":     true,
	"internal/anime/legacy/projection.go": true,
	"internal/anime/legacy/recovery.go":   true,
	"internal/anime/legacy/wire.go":       true,
}

var legacyFileIOImplementationFiles = map[string]bool{
	"internal/anime/legacy/gateway.go":  true,
	"internal/anime/legacy/recovery.go": true,
	"internal/anime/startup_catchup.go": true,
	"internal/anime/writer.go":          true,
}

var legacyWireFields = map[string]bool{
	"Activo": true, "Carpeta": true, "Dias": true, "Duracion": true,
	"Estado": true, "FechaCreacion": true, "FechaEliminacion": true,
	"FechaEstreno": true, "FechaUltCapVisto": true, "NroCapVisto": true,
	"Nombre": true, "Pagina": true, "Primeravez": true, "Repetir": true,
	"Tipo": true, "TotalCap": true,
}

var legacyJSONKeys = map[string]bool{
	"activo": true, "carpeta": true, "dias": true, "duracion": true,
	"estado": true, "fechaCreacion": true, "fechaEliminacion": true,
	"fechaEstreno": true, "fechaUltCapVisto": true, "nombre": true,
	"nrocapvisto": true, "pagina": true, "portada": true,
	"primeravez": true, "repetir": true, "tipo": true, "totalcap": true,
}

var fileIOFunctions = map[string]bool{
	"Create": true, "Lstat": true, "Open": true, "OpenFile": true,
	"ReadFile": true, "Remove": true, "Rename": true, "Stat": true,
	"WriteFile": true,
}

// checkLegacyBoundary reports legacy-boundary violations found in a Go source file.
func checkLegacyBoundary(filePath string, content []byte) ([]string, error) {
	if shouldSkipLegacyCheck(filePath, content) {
		return nil, nil
	}

	files := token.NewFileSet()
	parsed, err := parser.ParseFile(files, filePath, content, parser.ParseComments)
	if err != nil {
		return nil, fmt.Errorf("parse architecture-check input %q: %w", filePath, err)
	}

	imports := importAliases(parsed)
	legacyAliases := imports[legacyImportPath]
	legacyStructs := legacyJSONStructs(parsed)
	violations := make(map[string]struct{})
	addViolation := newLegacyViolationAdder(filePath, files, violations)
	scanLegacyDTOUsage(parsed, filePath, legacyAliases, addViolation)
	for _, violation := range analyzeLegacyDataflow(filePath, files, parsed, imports, legacyStructs) {
		violations[violation] = struct{}{}
	}
	return legacyViolationList(violations), nil
}

// newLegacyViolationAdder creates a callback that records source-located violations.
func newLegacyViolationAdder(filePath string, files *token.FileSet, violations map[string]struct{}) func(ast.Node, string) {
	return func(node ast.Node, reason string) {
		line := files.Position(node.Pos()).Line
		violations[fmt.Sprintf("%s:%d %s", filePath, line, reason)] = struct{}{}
	}
}

// scanLegacyDTOUsage records direct uses of the legacy DTO outside approved files.
func scanLegacyDTOUsage(parsed *ast.File, filePath string, legacyAliases map[string]bool, addViolation func(ast.Node, string)) {
	if isLegacyDTOAllowed(filePath) {
		return
	}
	ast.Inspect(parsed, func(node ast.Node) bool {
		switch value := node.(type) {
		case *ast.TypeSpec:
			if value.Name.Name == "LegacyAnimeRaw" {
				addViolation(value, "declares LegacyAnimeRaw outside the Legacy adapter")
			}
		case *ast.SelectorExpr:
			if referencesQualifiedLegacyRaw(value, legacyAliases) {
				addViolation(value, "uses legacy.LegacyAnimeRaw outside the Legacy adapter")
			}
		case *ast.Ident:
			if legacyAliases["."] && value.Name == "LegacyAnimeRaw" {
				addViolation(value, "uses legacy.LegacyAnimeRaw outside the Legacy adapter")
			}
		}
		return true
	})
}

// referencesQualifiedLegacyRaw reports whether a selector names the qualified legacy DTO.
func referencesQualifiedLegacyRaw(selector *ast.SelectorExpr, legacyAliases map[string]bool) bool {
	qualifier, ok := selector.X.(*ast.Ident)
	return ok && legacyAliases[qualifier.Name] && selector.Sel.Name == "LegacyAnimeRaw"
}

// legacyViolationList converts the violation set into a list of diagnostic strings.
func legacyViolationList(violations map[string]struct{}) []string {
	result := make([]string, 0, len(violations))
	for violation := range violations {
		result = append(result, violation)
	}
	return result
}

// shouldSkipLegacyCheck reports whether a file is outside the legacy check scope.
func shouldSkipLegacyCheck(filePath string, content []byte) bool {
	normalized := "/" + strings.TrimPrefix(filepathSlash(filePath), "./")
	return strings.HasSuffix(normalized, "_test.go") ||
		strings.Contains(normalized, "/testdata/") ||
		hasCanonicalGeneratedHeader(content)
}

// isLegacyDTOAllowed reports whether a file may use the legacy DTO directly.
func isLegacyDTOAllowed(filePath string) bool {
	return legacyDTOImplementationFiles[normalizedArchitecturePath(filePath)]
}

// isLegacyFileIOAllowed reports whether a file may access animes.dat directly.
func isLegacyFileIOAllowed(filePath string) bool {
	return legacyFileIOImplementationFiles[normalizedArchitecturePath(filePath)]
}

// isLegacySerializationAllowed reports whether a file may serialize legacy JSON.
func isLegacySerializationAllowed(filePath string) bool {
	return legacyDTOImplementationFiles[normalizedArchitecturePath(filePath)]
}

// hasCanonicalGeneratedHeader reports whether content begins with a generated-code header.
func hasCanonicalGeneratedHeader(content []byte) bool {
	for _, line := range strings.Split(strings.ReplaceAll(string(content), "\r\n", "\n"), "\n") {
		trimmed := strings.TrimSpace(line)
		if canonicalGeneratedHeader.MatchString(trimmed) {
			return true
		}
		if strings.HasPrefix(trimmed, "package ") {
			return false
		}
	}
	return false
}

// normalizedArchitecturePath converts a file path to the architecture check format.
func normalizedArchitecturePath(filePath string) string {
	return strings.TrimPrefix(filepathSlash(filePath), "./")
}

// filepathSlash replaces Windows path separators with forward slashes.
func filepathSlash(value string) string {
	return strings.ReplaceAll(value, "\\", "/")
}
