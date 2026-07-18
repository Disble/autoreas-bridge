package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"path/filepath"
	"strings"
)

const (
	flowFilePrefix    = "file:"
	flowPathJoin      = "path.join"
	flowDirFS         = "os.dirfs"
	flowJSONMarshal   = "json.marshal"
	flowJSONUnmarshal = "json.unmarshal"
	flowJSONDecoder   = "json.decoder"
	flowJSONEncoder   = "json.encoder"
	flowJSONDecode    = "json.decode"
	flowJSONEncode    = "json.encode"
	flowLegacyDecode  = "legacy.decode"
)

type legacyFlowAnalyzer struct {
	filePath      string
	files         *token.FileSet
	imports       map[string]map[string]bool
	legacyStructs map[string]bool
	violations    map[string]struct{}
}

// analyzeLegacyDataflow reports legacy-boundary violations discovered through AST flow analysis.
func analyzeLegacyDataflow(filePath string, files *token.FileSet, parsed *ast.File, imports map[string]map[string]bool, legacyStructs map[string]bool) []string {
	analyzer := &legacyFlowAnalyzer{
		filePath: filePath, files: files, imports: imports,
		legacyStructs: legacyStructs, violations: make(map[string]struct{}),
	}
	global := newFlowScope(nil)
	for _, declaration := range parsed.Decls {
		switch value := declaration.(type) {
		case *ast.GenDecl:
			analyzer.analyzeDeclaration(global, value)
		case *ast.FuncDecl:
			functionScope := newFlowScope(global)
			analyzer.defineFields(functionScope, value.Recv)
			analyzer.defineFields(functionScope, value.Type.Params)
			analyzer.defineFields(functionScope, value.Type.Results)
			analyzer.analyzeBlock(functionScope, value.Body)
		}
	}
	result := make([]string, 0, len(analyzer.violations))
	for violation := range analyzer.violations {
		result = append(result, violation)
	}
	return result
}

// analyzeBlock visits each statement in a block using the current flow scope.
func (analyzer *legacyFlowAnalyzer) analyzeBlock(scope *flowScope, block *ast.BlockStmt) {
	if block == nil {
		return
	}
	for _, statement := range block.List {
		analyzer.analyzeStatement(scope, statement)
	}
}

// analyzeStatement evaluates a statement and updates the flow scope as needed.
func (analyzer *legacyFlowAnalyzer) analyzeStatement(scope *flowScope, statement ast.Stmt) {
	switch value := statement.(type) {
	case *ast.AssignStmt:
		analyzer.analyzeAssignment(scope, value)
	case *ast.DeclStmt:
		if declaration, ok := value.Decl.(*ast.GenDecl); ok {
			analyzer.analyzeDeclaration(scope, declaration)
		}
	case *ast.ExprStmt:
		analyzer.evaluate(scope, value.X)
	case *ast.ReturnStmt:
		analyzer.evaluateExpressions(scope, value.Results)
	case *ast.DeferStmt:
		analyzer.evaluate(scope, value.Call)
	case *ast.GoStmt:
		analyzer.evaluate(scope, value.Call)
	case *ast.BlockStmt:
		analyzer.analyzeBlock(newFlowScope(scope), value)
	case *ast.IfStmt:
		analyzer.analyzeIf(scope, value)
	case *ast.ForStmt:
		analyzer.analyzeFor(scope, value)
	case *ast.RangeStmt:
		analyzer.analyzeRange(scope, value)
	case *ast.SwitchStmt:
		analyzer.analyzeSwitch(scope, value)
	case *ast.TypeSwitchStmt:
		analyzer.analyzeTypeSwitch(scope, value)
	case *ast.SelectStmt:
		analyzer.analyzeClauseBody(scope, value.Body.List)
	case *ast.SendStmt:
		analyzer.evaluate(scope, value.Chan)
		analyzer.evaluate(scope, value.Value)
	case *ast.IncDecStmt:
		analyzer.evaluate(scope, value.X)
	}
}

// analyzeDeclaration records flow values introduced by const and var declarations.
func (analyzer *legacyFlowAnalyzer) analyzeDeclaration(scope *flowScope, declaration *ast.GenDecl) {
	if declaration.Tok != token.CONST && declaration.Tok != token.VAR {
		return
	}
	for _, specification := range declaration.Specs {
		values, ok := specification.(*ast.ValueSpec)
		if !ok {
			continue
		}
		for index, name := range values.Names {
			value := analyzer.typeValue(values.Type)
			if index < len(values.Values) {
				value = value.merge(analyzer.evaluate(scope, values.Values[index]))
			}
			scope.define(name.Name, value)
		}
	}
}

// analyzeAssignment evaluates assignment values and updates their bindings.
func (analyzer *legacyFlowAnalyzer) analyzeAssignment(scope *flowScope, assignment *ast.AssignStmt) {
	values := make([]flowValue, len(assignment.Lhs))
	if len(assignment.Rhs) == len(assignment.Lhs) {
		for index, expression := range assignment.Rhs {
			values[index] = analyzer.evaluate(scope, expression)
		}
	} else if len(assignment.Rhs) == 1 {
		values[0] = analyzer.evaluate(scope, assignment.Rhs[0])
	}
	for index, left := range assignment.Lhs {
		name, ok := left.(*ast.Ident)
		if !ok {
			analyzer.evaluate(scope, left)
			continue
		}
		if assignment.Tok == token.DEFINE {
			scope.define(name.Name, values[index])
		} else {
			scope.assign(name.Name, values[index])
		}
	}
}

// analyzeIf evaluates both branches of an if statement and merges their bindings.
func (analyzer *legacyFlowAnalyzer) analyzeIf(scope *flowScope, statement *ast.IfStmt) {
	base := newFlowScope(scope)
	if statement.Init != nil {
		analyzer.analyzeStatement(base, statement.Init)
	}
	analyzer.evaluate(base, statement.Cond)
	thenScope := base.cloneChain()
	analyzer.analyzeBlock(newFlowScope(thenScope), statement.Body)
	elseScope := base.cloneChain()
	if statement.Else != nil {
		analyzer.analyzeStatement(elseScope, statement.Else)
	}
	base.mergeExisting(thenScope, elseScope)
}

// analyzeFor evaluates a for loop and merges the loop body's bindings.
func (analyzer *legacyFlowAnalyzer) analyzeFor(scope *flowScope, statement *ast.ForStmt) {
	loopScope := newFlowScope(scope)
	if statement.Init != nil {
		analyzer.analyzeStatement(loopScope, statement.Init)
	}
	analyzer.evaluate(loopScope, statement.Cond)
	bodyScope := loopScope.cloneChain()
	analyzer.analyzeBlock(newFlowScope(bodyScope), statement.Body)
	if statement.Post != nil {
		analyzer.analyzeStatement(bodyScope, statement.Post)
	}
	loopScope.mergeExisting(loopScope, bodyScope)
}

// analyzeRange evaluates a range loop and merges its body's bindings.
func (analyzer *legacyFlowAnalyzer) analyzeRange(scope *flowScope, statement *ast.RangeStmt) {
	analyzer.evaluate(scope, statement.X)
	bodyScope := newFlowScope(scope.cloneChain())
	for _, expression := range []ast.Expr{statement.Key, statement.Value} {
		if name, ok := expression.(*ast.Ident); ok {
			bodyScope.define(name.Name, flowValue{})
		}
	}
	analyzer.analyzeBlock(bodyScope, statement.Body)
	scope.mergeExisting(scope, bodyScope)
}

// analyzeSwitch evaluates a switch statement and its clauses.
func (analyzer *legacyFlowAnalyzer) analyzeSwitch(scope *flowScope, statement *ast.SwitchStmt) {
	switchScope := newFlowScope(scope)
	if statement.Init != nil {
		analyzer.analyzeStatement(switchScope, statement.Init)
	}
	analyzer.evaluate(switchScope, statement.Tag)
	analyzer.analyzeClauseBody(switchScope, statement.Body.List)
}

// analyzeTypeSwitch evaluates a type switch statement and its clauses.
func (analyzer *legacyFlowAnalyzer) analyzeTypeSwitch(scope *flowScope, statement *ast.TypeSwitchStmt) {
	switchScope := newFlowScope(scope)
	if statement.Init != nil {
		analyzer.analyzeStatement(switchScope, statement.Init)
	}
	analyzer.analyzeStatement(switchScope, statement.Assign)
	analyzer.analyzeClauseBody(switchScope, statement.Body.List)
}

// analyzeClauseBody evaluates case clauses and communication clauses.
func (analyzer *legacyFlowAnalyzer) analyzeClauseBody(scope *flowScope, clauses []ast.Stmt) {
	for _, clause := range clauses {
		caseClause, ok := clause.(*ast.CaseClause)
		if !ok {
			analyzer.analyzeCommunicationClause(scope, clause)
			continue
		}
		analyzer.evaluateExpressions(scope, caseClause.List)
		branch := newFlowScope(scope.cloneChain())
		for _, statement := range caseClause.Body {
			analyzer.analyzeStatement(branch, statement)
		}
	}
}

// analyzeCommunicationClause evaluates a select communication clause.
func (analyzer *legacyFlowAnalyzer) analyzeCommunicationClause(scope *flowScope, clause ast.Stmt) {
	communication, ok := clause.(*ast.CommClause)
	if !ok {
		return
	}
	branch := newFlowScope(scope.cloneChain())
	if communication.Comm != nil {
		analyzer.analyzeStatement(branch, communication.Comm)
	}
	for _, statement := range communication.Body {
		analyzer.analyzeStatement(branch, statement)
	}
}

// defineFields binds the flow values of fields in a function signature.
func (analyzer *legacyFlowAnalyzer) defineFields(scope *flowScope, fields *ast.FieldList) {
	if fields == nil {
		return
	}
	for _, field := range fields.List {
		value := analyzer.typeValue(field.Type)
		for _, name := range field.Names {
			scope.define(name.Name, value)
		}
	}
}

// typeValue derives the flow value represented by a type expression.
func (analyzer *legacyFlowAnalyzer) typeValue(expression ast.Expr) flowValue {
	result := flowValue{}
	if expressionUsesNamedType(expression, analyzer.legacyStructs) {
		result.legacyJSON = true
	}
	if isLegacyRawType(expression, analyzer.imports[legacyImportPath]) {
		result.legacyRaw = true
		result.legacyJSON = true
	}
	if selector, ok := expression.(*ast.SelectorExpr); ok && selector.Sel.Name == "LegacyAnimeRaw" {
		if qualifier, ok := selector.X.(*ast.Ident); ok && analyzer.imports[legacyDomainImportPath][qualifier.Name] {
			result.legacyRaw = true
			result.legacyJSON = true
		}
	}
	return result
}

// evaluateExpressions resolves a sequence of AST expressions.
func (analyzer *legacyFlowAnalyzer) evaluateExpressions(scope *flowScope, expressions []ast.Expr) []flowValue {
	result := make([]flowValue, len(expressions))
	for index, expression := range expressions {
		result[index] = analyzer.evaluate(scope, expression)
	}
	return result
}

// add records a source-located flow-analysis violation.
func (analyzer *legacyFlowAnalyzer) add(node ast.Node, reason string) {
	line := analyzer.files.Position(node.Pos()).Line
	analyzer.violations[fmt.Sprintf("%s:%d %s", analyzer.filePath, line, reason)] = struct{}{}
}

// firstFlowArgument returns the first flow argument when one exists.
func firstFlowArgument(arguments []flowValue) flowValue {
	if len(arguments) == 0 {
		return flowValue{}
	}
	return arguments[0]
}

// joinFlowStrings combines candidate path strings using filepath.Join.
func joinFlowStrings(arguments []flowValue) flowValue {
	if len(arguments) == 0 {
		return flowValue{}
	}
	result := stringFlowValue("")
	for _, argument := range arguments {
		next := flowValue{strings: make(map[string]struct{})}
		for prefix := range result.strings {
			for suffix := range argument.strings {
				next.strings[filepath.Join(prefix, suffix)] = struct{}{}
			}
		}
		result = next
	}
	return result
}

// isAnimeDataPath reports whether a path identifies animes.dat.
func isAnimeDataPath(candidate string) bool {
	return strings.EqualFold(filepath.Base(candidate), "animes.dat")
}
