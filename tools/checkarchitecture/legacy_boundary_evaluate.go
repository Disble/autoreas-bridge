package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"path/filepath"
	"strconv"
	"strings"
)

func (analyzer *legacyFlowAnalyzer) evaluate(scope *flowScope, expression ast.Expr) flowValue {
	switch value := expression.(type) {
	case *ast.BasicLit:
		if value.Kind == token.STRING {
			decoded, err := strconv.Unquote(value.Value)
			if err == nil {
				return stringFlowValue(decoded)
			}
		}
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
		result := analyzer.typeValue(value.Type)
		legacyKeys := 0
		for _, element := range value.Elts {
			if pair, ok := element.(*ast.KeyValueExpr); ok {
				analyzer.evaluate(scope, pair.Value)
				if key, ok := pair.Key.(*ast.BasicLit); ok && key.Kind == token.STRING {
					name, err := strconv.Unquote(key.Value)
					if err == nil && legacyJSONKeys[name] {
						legacyKeys++
					}
				}
			}
		}
		result.legacyJSON = result.legacyJSON || legacyKeys >= 2
		return result
	case *ast.IndexExpr:
		analyzer.evaluate(scope, value.X)
		analyzer.evaluate(scope, value.Index)
	case *ast.SliceExpr:
		analyzer.evaluate(scope, value.X)
	}
	return flowValue{}
}

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

func (analyzer *legacyFlowAnalyzer) evaluateSelector(scope *flowScope, selector *ast.SelectorExpr) flowValue {
	if qualifier, ok := selector.X.(*ast.Ident); ok {
		name := qualifier.Name
		if analyzer.imports["os"][name] {
			if fileIOFunctions[selector.Sel.Name] {
				return functionFlowValue(flowFilePrefix + selector.Sel.Name)
			}
			if selector.Sel.Name == "DirFS" {
				return functionFlowValue(flowDirFS)
			}
		}
		if (analyzer.imports["path/filepath"][name] || analyzer.imports["path"][name]) && selector.Sel.Name == "Join" {
			return functionFlowValue(flowPathJoin)
		}
		if analyzer.imports["encoding/json"][name] {
			switch selector.Sel.Name {
			case "Marshal", "MarshalIndent":
				return functionFlowValue(flowJSONMarshal)
			case "Unmarshal":
				return functionFlowValue(flowJSONUnmarshal)
			case "NewDecoder":
				return functionFlowValue(flowJSONDecoder)
			case "NewEncoder":
				return functionFlowValue(flowJSONEncoder)
			}
		}
		if analyzer.imports[legacyImportPath][name] && selector.Sel.Name == "Decode" {
			return functionFlowValue(flowLegacyDecode)
		}
	}
	receiver := analyzer.evaluate(scope, selector.X)
	if selector.Sel.Name == "Open" {
		result := flowValue{}
		for root := range receiver.dirFSRoots {
			result = result.merge(boundFunctionFlowValue(flowFilePrefix+"DirFS.Open", root))
		}
		return result
	}
	if selector.Sel.Name == "Decode" && receiver.decoder {
		return functionFlowValue(flowJSONDecode)
	}
	if selector.Sel.Name == "Encode" && receiver.encoder {
		return functionFlowValue(flowJSONEncode)
	}
	if receiver.legacyRaw && legacyWireFields[selector.Sel.Name] && !isLegacyDTOAllowed(analyzer.filePath) {
		analyzer.add(selector, fmt.Sprintf("uses Spanish Legacy wire field %s outside the Legacy adapter", selector.Sel.Name))
	}
	return flowValue{}
}

func (analyzer *legacyFlowAnalyzer) evaluateCall(scope *flowScope, call *ast.CallExpr) flowValue {
	function := analyzer.evaluate(scope, call.Fun)
	arguments := analyzer.evaluateExpressions(scope, call.Args)
	result := flowValue{}
	for candidate := range function.functions {
		switch {
		case candidate.kind == flowPathJoin:
			result = result.merge(joinFlowStrings(arguments))
		case candidate.kind == flowDirFS:
			for root := range firstFlowArgument(arguments).strings {
				if result.dirFSRoots == nil {
					result.dirFSRoots = make(map[string]struct{})
				}
				result.dirFSRoots[root] = struct{}{}
			}
		case strings.HasPrefix(candidate.kind, flowFilePrefix):
			if analyzer.fileCallReferencesAnimeData(candidate, arguments) && !isLegacyFileIOAllowed(analyzer.filePath) {
				analyzer.add(call, "performs animes.dat file I/O outside the Legacy gateway")
			}
		case candidate.kind == flowJSONMarshal || candidate.kind == flowJSONEncode:
			if firstFlowArgument(arguments).legacyJSON && !isLegacySerializationAllowed(analyzer.filePath) {
				analyzer.add(call, "serializes Legacy JSON outside the Legacy adapter")
			}
		case candidate.kind == flowJSONUnmarshal:
			if len(arguments) > 1 && arguments[1].legacyJSON && !isLegacySerializationAllowed(analyzer.filePath) {
				analyzer.add(call, "parses Legacy JSON outside the Legacy adapter")
			}
		case candidate.kind == flowJSONDecode:
			if firstFlowArgument(arguments).legacyJSON && !isLegacySerializationAllowed(analyzer.filePath) {
				analyzer.add(call, "parses Legacy JSON outside the Legacy adapter")
			}
		case candidate.kind == flowJSONDecoder:
			result.decoder = true
		case candidate.kind == flowJSONEncoder:
			result.encoder = true
		case candidate.kind == flowLegacyDecode:
			result.legacyRaw = true
		}
	}
	return result
}

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
