# Runtime Values report

The report starts with a fixed top-level heading:

```md
# Runtime Values
```

After the heading, the file contains one section per captured runtime value:

````md
## <source-file-path>
- line: <line>
- expression: `<expression>`
```
<formatted runtime value>
```
### Test
- name: <test name>
- file: <test-file-path>

## <source-file-path>
...
````

Format details:

- `## <source-file-path>` starts one runtime value entry. The same source file can appear many times when multiple tests or multiple executions reach the inspected location.
- `- line:` is the source line where Wallaby evaluated the expression.
- `- expression:` is the inspected expression.
- The fenced block contains Wallaby's formatted runtime value. Values can be primitives, arrays, objects, `undefined`, thrown evaluation output, or any other display text Wallaby captures for the expression.
- `### Test` appears when Wallaby can associate the value with a test.
- `- name:` is the full test name. Nested suite names are joined with ` / `.
- `- file:` is the test file that produced the value.
- Entries are written in the order Wallaby exports them. The formatter does not group, deduplicate, or sort them.

The main inspect report may omit some matching runtime values. Open `runtime-values.md` when the main report says more runtime values were omitted.

When the inspect command uses `--test`, the main report filters runtime values by test name. This file still contains all captured values, not only values matching the filter.
