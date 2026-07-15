package main

type flowFunction struct {
	kind  string
	bound string
}

type flowValue struct {
	strings    map[string]struct{}
	functions  map[flowFunction]struct{}
	dirFSRoots map[string]struct{}
	legacyRaw  bool
	legacyJSON bool
	decoder    bool
	encoder    bool
}

func stringFlowValue(value string) flowValue {
	return flowValue{strings: map[string]struct{}{value: {}}}
}

func functionFlowValue(kind string) flowValue {
	return flowValue{functions: map[flowFunction]struct{}{{kind: kind}: {}}}
}

func boundFunctionFlowValue(kind, bound string) flowValue {
	return flowValue{functions: map[flowFunction]struct{}{{kind: kind, bound: bound}: {}}}
}

func (value flowValue) merge(other flowValue) flowValue {
	result := value.clone()
	if result.strings == nil && len(other.strings) > 0 {
		result.strings = make(map[string]struct{})
	}
	for item := range other.strings {
		result.strings[item] = struct{}{}
	}
	if result.functions == nil && len(other.functions) > 0 {
		result.functions = make(map[flowFunction]struct{})
	}
	for item := range other.functions {
		result.functions[item] = struct{}{}
	}
	if result.dirFSRoots == nil && len(other.dirFSRoots) > 0 {
		result.dirFSRoots = make(map[string]struct{})
	}
	for item := range other.dirFSRoots {
		result.dirFSRoots[item] = struct{}{}
	}
	result.legacyRaw = result.legacyRaw || other.legacyRaw
	result.legacyJSON = result.legacyJSON || other.legacyJSON
	result.decoder = result.decoder || other.decoder
	result.encoder = result.encoder || other.encoder
	return result
}

func (value flowValue) clone() flowValue {
	result := flowValue{
		legacyRaw: value.legacyRaw, legacyJSON: value.legacyJSON,
		decoder: value.decoder, encoder: value.encoder,
	}
	if len(value.strings) > 0 {
		result.strings = make(map[string]struct{}, len(value.strings))
		for item := range value.strings {
			result.strings[item] = struct{}{}
		}
	}
	if len(value.functions) > 0 {
		result.functions = make(map[flowFunction]struct{}, len(value.functions))
		for item := range value.functions {
			result.functions[item] = struct{}{}
		}
	}
	if len(value.dirFSRoots) > 0 {
		result.dirFSRoots = make(map[string]struct{}, len(value.dirFSRoots))
		for item := range value.dirFSRoots {
			result.dirFSRoots[item] = struct{}{}
		}
	}
	return result
}

type flowScope struct {
	parent *flowScope
	values map[string]flowValue
}

func newFlowScope(parent *flowScope) *flowScope {
	return &flowScope{parent: parent, values: make(map[string]flowValue)}
}

func (scope *flowScope) lookup(name string) flowValue {
	for current := scope; current != nil; current = current.parent {
		if value, ok := current.values[name]; ok {
			return value
		}
	}
	return flowValue{}
}

func (scope *flowScope) define(name string, value flowValue) {
	if name != "_" {
		scope.values[name] = value
	}
}

func (scope *flowScope) assign(name string, value flowValue) {
	if name == "_" {
		return
	}
	for current := scope; current != nil; current = current.parent {
		if _, ok := current.values[name]; ok {
			current.values[name] = value
			return
		}
	}
	scope.values[name] = value
}

func (scope *flowScope) cloneChain() *flowScope {
	if scope == nil {
		return nil
	}
	cloned := newFlowScope(scope.parent.cloneChain())
	for name, value := range scope.values {
		cloned.values[name] = value.clone()
	}
	return cloned
}

func (scope *flowScope) mergeExisting(branches ...*flowScope) {
	for current := scope; current != nil; current = current.parent {
		for name, original := range current.values {
			merged := flowValue{}
			for _, branch := range branches {
				merged = merged.merge(branch.lookup(name))
			}
			if len(branches) == 0 {
				merged = original
			}
			current.values[name] = merged
		}
	}
}
