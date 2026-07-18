package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
)

// evaluate resolves the flow value represented by an AST expression.
func (analyzer *legacyFlowAnalyzer) evaluate(scope *flowScope, expression ast.Expr) flowValue {
	switch value := expression.(type) {
	case *ast.BasicLit:
		return evaluateStringLiteral(value)
	case *ast.Ident:
		return scope.lookup(value.Name)
	case *ast.ParenExpr:
		return analyzer.evaluate(scope, value.X)
	case *ast.UnaryExpr:
		return analyzer.evaluate(scope, value.X)
	case *ast.BinaryExpr:
		return analyzer.evaluateBinary(scope, value)
	case *ast.SelectorExpr:
		return analyzer.evaluateSelector(scope, value)
	case *ast.CallExpr:
		return analyzer.evaluateCall(scope, value)
	case *ast.CompositeLit:
		return analyzer.evaluateCompositeLiteral(scope, value)
	case *ast.IndexExpr:
		analyzer.evaluate(scope, value.X)
		analyzer.evaluate(scope, value.Index)
	case *ast.SliceExpr:
		analyzer.evaluate(scope, value.X)
	}
	return flowValue{}
}

// evaluateStringLiteral converts a string literal into a flow value.
func evaluateStringLiteral(value *ast.BasicLit) flowValue {
	if value.Kind != token.STRING {
		return flowValue{}
	}
	decoded, err := strconv.Unquote(value.Value)
	if err != nil {
		return flowValue{}
	}
	return stringFlowValue(decoded)
}

// evaluateCompositeLiteral resolves a composite literal and detects legacy JSON fields.
func (analyzer *legacyFlowAnalyzer) evaluateCompositeLiteral(scope *flowScope, value *ast.CompositeLit) flowValue {
	result := analyzer.typeValue(value.Type)
	legacyKeys := 0
	for _, element := range value.Elts {
		if analyzer.evaluateCompositeElement(scope, element) {
			legacyKeys++
		}
	}
	result.legacyJSON = result.legacyJSON || legacyKeys >= 2
	return result
}

// evaluateCompositeElement evaluates a composite element and identifies legacy JSON keys.
func (analyzer *legacyFlowAnalyzer) evaluateCompositeElement(scope *flowScope, element ast.Expr) bool {
	pair, ok := element.(*ast.KeyValueExpr)
	if !ok {
		return false
	}
	analyzer.evaluate(scope, pair.Value)
	return isLegacyJSONStringKey(pair.Key)
}

// isLegacyJSONStringKey reports whether an expression is a recognized legacy JSON key.
func isLegacyJSONStringKey(expression ast.Expr) bool {
	key, ok := expression.(*ast.BasicLit)
	if !ok || key.Kind != token.STRING {
		return false
	}
	name, err := strconv.Unquote(key.Value)
	return err == nil && legacyJSONKeys[name]
}

// evaluateBinary resolves string concatenation represented by a binary expression.
func (analyzer *legacyFlowAnalyzer) evaluateBinary(scope *flowScope, expression *ast.BinaryExpr) flowValue {
	left := analyzer.evaluate(scope, expression.X)
	right := analyzer.evaluate(scope, expression.Y)
	if expression.Op != token.ADD || len(left.strings) == 0 || len(right.strings) == 0 {
		return flowValue{}
	}
	result := flowValue{strings: make(map[string]struct{})}
	for prefix := range left.strings {
		for suffix := range right.strings {
			result.strings[prefix+suffix] = struct{}{}
		}
	}
	return result
}

// evaluateSelector resolves imported and receiver-based selector expressions.
func (analyzer *legacyFlowAnalyzer) evaluateSelector(scope *flowScope, selector *ast.SelectorExpr) flowValue {
	if value, ok := analyzer.evaluateImportedSelector(selector); ok {
		return value
	}
	receiver := analyzer.evaluate(scope, selector.X)
	if value, ok := evaluateReceiverSelector(selector.Sel.Name, receiver); ok {
		return value
	}
	if receiver.legacyRaw && legacyWireFields[selector.Sel.Name] && !isLegacyDTOAllowed(analyzer.filePath) {
		analyzer.add(selector, fmt.Sprintf("uses Spanish Legacy wire field %s outside the Legacy adapter", selector.Sel.Name))
	}
	return flowValue{}
}

// evaluateImportedSelector resolves selectors that refer to imported functions.
func (analyzer *legacyFlowAnalyzer) evaluateImportedSelector(selector *ast.SelectorExpr) (flowValue, bool) {
	qualifier, ok := selector.X.(*ast.Ident)
	if !ok {
		return flowValue{}, false
	}
	name := qualifier.Name
	if value, ok := analyzer.evaluateOSSelector(name, selector.Sel.Name); ok {
		return value, true
	}
	if (analyzer.imports["path/filepath"][name] || analyzer.imports["path"][name]) && selector.Sel.Name == "Join" {
		return functionFlowValue(flowPathJoin), true
	}
	if value, ok := analyzer.evaluateJSONSelector(name, selector.Sel.Name); ok {
		return value, true
	}
	if analyzer.imports[legacyImportPath][name] && selector.Sel.Name == "Decode" {
		return functionFlowValue(flowLegacyDecode), true
	}
	return flowValue{}, false
}

// evaluateOSSelector resolves supported selectors from the os package.
func (analyzer *legacyFlowAnalyzer) evaluateOSSelector(importName string, selectorName string) (flowValue, bool) {
	if !analyzer.imports["os"][importName] {
		return flowValue{}, false
	}
	if fileIOFunctions[selectorName] {
		return functionFlowValue(flowFilePrefix + selectorName), true
	}
	if selectorName == "DirFS" {
		return functionFlowValue(flowDirFS), true
	}
	return flowValue{}, false
}

// evaluateJSONSelector resolves supported selectors from encoding/json.
func (analyzer *legacyFlowAnalyzer) evaluateJSONSelector(importName string, selectorName string) (flowValue, bool) {
	if !analyzer.imports["encoding/json"][importName] {
		return flowValue{}, false
	}
	switch selectorName {
	case "Marshal", "MarshalIndent":
		return functionFlowValue(flowJSONMarshal), true
	case "Unmarshal":
		return functionFlowValue(flowJSONUnmarshal), true
	case "NewDecoder":
		return functionFlowValue(flowJSONDecoder), true
	case "NewEncoder":
		return functionFlowValue(flowJSONEncoder), true
	default:
		return flowValue{}, false
	}
}

// evaluateReceiverSelector resolves selectors applied to tracked flow receivers.
func evaluateReceiverSelector(selectorName string, receiver flowValue) (flowValue, bool) {
	if selectorName == "Open" {
		return dirFSOpenFlowValue(receiver), true
	}
	if selectorName == "Decode" && receiver.decoder {
		return functionFlowValue(flowJSONDecode), true
	}
	if selectorName == "Encode" && receiver.encoder {
		return functionFlowValue(flowJSONEncode), true
	}
	return flowValue{}, false
}

// dirFSOpenFlowValue derives the flow value for a tracked DirFS Open method.
func dirFSOpenFlowValue(receiver flowValue) flowValue {
	result := flowValue{}
	for root := range receiver.dirFSRoots {
		result = result.merge(boundFunctionFlowValue(flowFilePrefix+"DirFS.Open", root))
	}
	return result
}

// evaluateCall resolves a call expression and applies its tracked effects.
func (analyzer *legacyFlowAnalyzer) evaluateCall(scope *flowScope, call *ast.CallExpr) flowValue {
	function := analyzer.evaluate(scope, call.Fun)
	arguments := analyzer.evaluateExpressions(scope, call.Args)
	result := flowValue{}
	for candidate := range function.functions {
		result = analyzer.evaluateCallCandidate(call, candidate, arguments, result)
	}
	return result
}

// evaluateCallCandidate applies the flow effect of one candidate function.
func (analyzer *legacyFlowAnalyzer) evaluateCallCandidate(call *ast.CallExpr, candidate flowFunction, arguments []flowValue, result flowValue) flowValue {
	switch {
	case candidate.kind == flowPathJoin:
		return result.merge(joinFlowStrings(arguments))
	case candidate.kind == flowDirFS:
		return mergeDirFSRoots(result, firstFlowArgument(arguments))
	case strings.HasPrefix(candidate.kind, flowFilePrefix):
		analyzer.reportLegacyFileIO(call, candidate, arguments)
	case candidate.kind == flowJSONMarshal || candidate.kind == flowJSONEncode:
		analyzer.reportLegacyJSONEncoding(call, arguments)
	case candidate.kind == flowJSONUnmarshal:
		analyzer.reportLegacyJSONUnmarshal(call, arguments)
	case candidate.kind == flowJSONDecode:
		analyzer.reportLegacyJSONDecode(call, arguments)
	case candidate.kind == flowJSONDecoder:
		result.decoder = true
	case candidate.kind == flowJSONEncoder:
		result.encoder = true
	case candidate.kind == flowLegacyDecode:
		result.legacyRaw = true
	}
	return result
}

// mergeDirFSRoots adds tracked directory roots to a flow value.
func mergeDirFSRoots(result flowValue, argument flowValue) flowValue {
	for root := range argument.strings {
		if result.dirFSRoots == nil {
			result.dirFSRoots = make(map[string]struct{})
		}
		result.dirFSRoots[root] = struct{}{}
	}
	return result
}

// reportLegacyFileIO reports animes.dat access outside the approved gateway.
func (analyzer *legacyFlowAnalyzer) reportLegacyFileIO(call *ast.CallExpr, candidate flowFunction, arguments []flowValue) {
	if analyzer.fileCallReferencesAnimeData(candidate, arguments) && !isLegacyFileIOAllowed(analyzer.filePath) {
		analyzer.add(call, "performs animes.dat file I/O outside the Legacy gateway")
	}
}

// reportLegacyJSONEncoding reports legacy JSON encoding outside the approved adapter.
func (analyzer *legacyFlowAnalyzer) reportLegacyJSONEncoding(call *ast.CallExpr, arguments []flowValue) {
	if firstFlowArgument(arguments).legacyJSON && !isLegacySerializationAllowed(analyzer.filePath) {
		analyzer.add(call, "serializes Legacy JSON outside the Legacy adapter")
	}
}

// reportLegacyJSONUnmarshal reports legacy JSON unmarshalling outside the approved adapter.
func (analyzer *legacyFlowAnalyzer) reportLegacyJSONUnmarshal(call *ast.CallExpr, arguments []flowValue) {
	if len(arguments) > 1 && arguments[1].legacyJSON && !isLegacySerializationAllowed(analyzer.filePath) {
		analyzer.add(call, "parses Legacy JSON outside the Legacy adapter")
	}
}

// reportLegacyJSONDecode reports legacy JSON decoding outside the approved adapter.
func (analyzer *legacyFlowAnalyzer) reportLegacyJSONDecode(call *ast.CallExpr, arguments []flowValue) {
	if firstFlowArgument(arguments).legacyJSON && !isLegacySerializationAllowed(analyzer.filePath) {
		analyzer.add(call, "parses Legacy JSON outside the Legacy adapter")
	}
}

// fileCallReferencesAnimeData reports whether call arguments resolve to animes.dat.
func (analyzer *legacyFlowAnalyzer) fileCallReferencesAnimeData(function flowFunction, arguments []flowValue) bool {
	if function.bound != "" && len(arguments) > 0 {
		for relative := range arguments[0].strings {
			if isAnimeDataPath(filepath.Join(function.bound, relative)) {
				return true
			}
		}
	}
	for _, argument := range arguments {
		for candidate := range argument.strings {
			if isAnimeDataPath(candidate) {
				return true
			}
		}
	}
	return false
}
