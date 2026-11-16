package main

import (
	"bytes"
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"io"
	"io/fs"
	"path/filepath"
	"slices"
	"strings"

	"gopkg.in/yaml.v3"
)

// Binding rules (ADR-032 §5). An exported method of App in internal/desktop is a
// Wails binding: it must reach its services through a module handle's Use, and it
// must not answer a string status or a slice without an error. Legacy bindings
// sit in an identified-violation baseline until their module migrates.
const (
	ruleBindingUsesHandle = "binding-uses-handle"
	ruleBindingSignature  = "binding-signature"
)

// bindingBaselinePath is the repository-relative baseline of legacy binding violations.
const bindingBaselinePath = "tools/checkarchitecture/baseline.yaml"

// bindingGuidance closes every binding failure: where to read how to do it right.
const bindingGuidance = "see skill bridge-data and ADR-032 (docs/adr/032-async-state-standard.md)"

// bindingRuleHelp is the helper each rule points to.
var bindingRuleHelp = map[string]string{
	ruleBindingUsesHandle: "reaches its services without a module handle; return modules.Handle.Use(func(services) (T, error)) " +
		"of its module (or the shell handle's Use for shell capabilities)",
	ruleBindingSignature: "returns a string status or a slice without an error; return (T, error), build failures with " +
		"apperr.InvalidArgument, apperr.NotFound or apperr.Internal, and return outcomes (applied, no_op, conflict) as results",
}

// bindingViolation identifies one violation the way the baseline lists it.
type bindingViolation struct {
	Rule   string `yaml:"rule"`
	File   string `yaml:"file"`
	Symbol string `yaml:"symbol"`
}

// String renders the violation as its baseline entry.
func (v bindingViolation) String() string {
	return fmt.Sprintf("{rule: %s, file: %s, symbol: %s}", v.Rule, v.File, v.Symbol)
}

// bindingBaseline is the shape of baseline.yaml.
type bindingBaseline struct {
	Version    int                `yaml:"version"`
	Violations []bindingViolation `yaml:"violations"`
}

// bindingViolations returns the binding-rule violations of one file, or a
// message when a desktop file cannot be parsed.
func bindingViolations(path, text string) ([]bindingViolation, []string) {
	if !isBindingScope(path) {
		return nil, nil
	}
	file, err := parser.ParseFile(token.NewFileSet(), path, text, parser.SkipObjectResolution)
	if err != nil {
		return nil, []string{fmt.Sprintf("%s cannot be parsed to check bindings: %v", path, err)}
	}
	var violations []bindingViolation
	for _, declaration := range file.Decls {
		method, ok := declaration.(*ast.FuncDecl)
		if !ok || !isAppBinding(method) {
			continue
		}
		if !callsHandleUse(method.Body) {
			violations = append(violations, bindingViolation{Rule: ruleBindingUsesHandle, File: path, Symbol: method.Name.Name})
		}
		if returnsStatusWithoutError(method.Type.Results) {
			violations = append(violations, bindingViolation{Rule: ruleBindingSignature, File: path, Symbol: method.Name.Name})
		}
	}
	return violations, nil
}

// isBindingScope reports whether path is production Go source of package desktop itself.
func isBindingScope(path string) bool {
	rest, ok := strings.CutPrefix(path, "internal/desktop/")
	return ok && !strings.Contains(rest, "/") && filepath.Ext(rest) == ".go" && !strings.HasSuffix(rest, "_test.go")
}

// isAppBinding reports whether method is an exported method of App.
func isAppBinding(method *ast.FuncDecl) bool {
	if method.Recv == nil || len(method.Recv.List) != 1 || !method.Name.IsExported() {
		return false
	}
	receiver := method.Recv.List[0].Type
	if star, ok := receiver.(*ast.StarExpr); ok {
		receiver = star.X
	}
	ident, ok := receiver.(*ast.Ident)
	return ok && ident.Name == "App"
}

// callsHandleUse reports whether body calls a method named Use on some value,
// with or without explicit type arguments.
func callsHandleUse(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return !found
		}
		function := call.Fun
		if index, ok := function.(*ast.IndexExpr); ok {
			function = index.X
		}
		if selector, ok := function.(*ast.SelectorExpr); ok && selector.Sel.Name == "Use" {
			found = true
		}
		return !found
	})
	return found
}

// returnsStatusWithoutError reports whether results hold a string or a slice and no error.
func returnsStatusWithoutError(results *ast.FieldList) bool {
	if results == nil {
		return false
	}
	statusLike := false
	for _, field := range results.List {
		switch typ := field.Type.(type) {
		case *ast.Ident:
			if typ.Name == "error" {
				return false
			}
			statusLike = statusLike || typ.Name == "string"
		case *ast.ArrayType:
			statusLike = statusLike || typ.Len == nil
		}
	}
	return statusLike
}

// checkBindingBaseline compares the violations found with the baseline: a
// violation the baseline does not list fails, and so does a baseline entry that
// no longer occurs. It prints the entry count to out.
func checkBindingBaseline(root string, source architectureFS, found []bindingViolation, out io.Writer) ([]string, error) {
	baseline, err := loadBindingBaseline(root, source)
	if err != nil {
		return nil, err
	}
	listed := map[bindingViolation]bool{}
	var messages []string
	for _, entry := range baseline.Violations {
		if listed[entry] {
			messages = append(messages, fmt.Sprintf("duplicate baseline entry in %s: %s; delete one", bindingBaselinePath, entry))
		}
		listed[entry] = true
	}
	occurring := map[bindingViolation]bool{}
	for _, violation := range found {
		occurring[violation] = true
		if !listed[violation] {
			messages = append(messages, fmt.Sprintf("%s: App.%s %s; %s [%s]",
				violation.File, violation.Symbol, bindingRuleHelp[violation.Rule], bindingGuidance, violation.Rule))
		}
	}
	for _, entry := range baseline.Violations {
		if !occurring[entry] {
			messages = append(messages, fmt.Sprintf("stale baseline entry in %s: %s no longer occurs; delete that entry; %s",
				bindingBaselinePath, entry, bindingGuidance))
		}
	}
	_, err = fmt.Fprintf(out, "binding baseline: %d entries (%s)\n", len(baseline.Violations), countByRule(baseline.Violations))
	return messages, err
}

// countByRule renders how many baseline entries each rule has, rules sorted.
func countByRule(entries []bindingViolation) string {
	counts := map[string]int{}
	for _, entry := range entries {
		counts[entry.Rule]++
	}
	rules := make([]string, 0, len(counts))
	for rule := range counts {
		rules = append(rules, rule)
	}
	slices.Sort(rules)
	parts := make([]string, 0, len(rules))
	for _, rule := range rules {
		parts = append(parts, fmt.Sprintf("%s: %d", rule, counts[rule]))
	}
	return strings.Join(parts, ", ")
}

// loadBindingBaseline reads baseline.yaml under root. A missing file is an empty
// baseline: every violation then fails, so the absence cannot hide one.
func loadBindingBaseline(root string, source architectureFS) (bindingBaseline, error) {
	path := filepath.Join(root, filepath.FromSlash(bindingBaselinePath))
	raw, err := source.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) || (err == nil && len(bytes.TrimSpace(raw)) == 0) {
		return bindingBaseline{}, nil
	}
	if err != nil {
		return bindingBaseline{}, fmt.Errorf("read binding baseline %s: %w", bindingBaselinePath, err)
	}
	decoder := yaml.NewDecoder(bytes.NewReader(raw))
	decoder.KnownFields(true)
	var baseline bindingBaseline
	if err := decoder.Decode(&baseline); err != nil {
		return bindingBaseline{}, fmt.Errorf("decode binding baseline %s: %w", bindingBaselinePath, err)
	}
	if baseline.Version != 1 {
		return bindingBaseline{}, fmt.Errorf("binding baseline %s has version %d, want 1", bindingBaselinePath, baseline.Version)
	}
	return baseline, nil
}
