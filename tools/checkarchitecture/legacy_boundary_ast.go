package main

import (
	"go/ast"
	"go/token"
	"path"
	"reflect"
	"strconv"
	"strings"
)

// importAliases maps each imported package path to its names in the source file.
func importAliases(file *ast.File) map[string]map[string]bool {
	aliases := make(map[string]map[string]bool)
	for _, spec := range file.Imports {
		importPath, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		name := path.Base(importPath)
		if spec.Name != nil {
			name = spec.Name.Name
		}
		if aliases[importPath] == nil {
			aliases[importPath] = make(map[string]bool)
		}
		aliases[importPath][name] = true
	}
	return aliases
}

// legacyJSONStructs identifies local structs containing multiple legacy JSON fields.
func legacyJSONStructs(file *ast.File) map[string]bool {
	result := make(map[string]bool)
	for _, declaration := range file.Decls {
		general, ok := declaration.(*ast.GenDecl)
		if !ok || general.Tok != token.TYPE {
			continue
		}
		for _, specification := range general.Specs {
			typeSpec, ok := specification.(*ast.TypeSpec)
			if !ok {
				continue
			}
			structure, ok := typeSpec.Type.(*ast.StructType)
			if ok && legacyJSONTagCount(structure) >= 2 {
				result[typeSpec.Name.Name] = true
			}
		}
	}
	return result
}

// expressionUsesNamedType reports whether an expression refers to a named type.
func expressionUsesNamedType(expression ast.Expr, names map[string]bool) bool {
	switch value := expression.(type) {
	case *ast.Ident:
		return names[value.Name]
	case *ast.SelectorExpr:
		return names[value.Sel.Name]
	case *ast.StarExpr:
		return expressionUsesNamedType(value.X, names)
	case *ast.ArrayType:
		return expressionUsesNamedType(value.Elt, names)
	default:
		return false
	}
}

// isLegacyRawType reports whether an expression denotes LegacyAnimeRaw.
func isLegacyRawType(expression ast.Expr, aliases map[string]bool) bool {
	switch value := expression.(type) {
	case *ast.SelectorExpr:
		qualifier, ok := value.X.(*ast.Ident)
		return ok && aliases[qualifier.Name] && value.Sel.Name == "LegacyAnimeRaw"
	case *ast.Ident:
		return aliases["."] && value.Name == "LegacyAnimeRaw"
	case *ast.StarExpr:
		return isLegacyRawType(value.X, aliases)
	case *ast.ArrayType:
		return isLegacyRawType(value.Elt, aliases)
	default:
		return false
	}
}

// legacyJSONTagCount counts legacy JSON field tags on a struct type.
func legacyJSONTagCount(structure *ast.StructType) int {
	count := 0
	for _, field := range structure.Fields.List {
		if field.Tag == nil {
			continue
		}
		tag, err := strconv.Unquote(field.Tag.Value)
		if err != nil {
			continue
		}
		name := strings.Split(reflect.StructTag(tag).Get("json"), ",")[0]
		if legacyJSONKeys[name] {
			count++
		}
	}
	return count
}
