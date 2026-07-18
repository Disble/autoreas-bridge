package main

import (
	"path/filepath"
	"strings"
	"testing"
)

var legacyJSONBypassCases = []struct {
	name       string
	content    string
	diagnostic string
}{
	{
		name: "unmarshal function alias",
		content: "package season\n" +
			"import codec \"encoding/json\"\n" +
			"type wireRecord struct {\n" +
			"  Page string `json:\"pagina\"`\n" +
			"  Progress float64 `json:\"nrocapvisto\"`\n" +
			"}\n" +
			"func decode(payload []byte) {\n" +
			"  var value wireRecord\n" +
			"  unmarshal := codec.Unmarshal\n" +
			"  _ = unmarshal(payload, &value)\n" +
			"}\n",
		diagnostic: "parses Legacy JSON outside the Legacy adapter",
	},
	{
		name: "detached decoder",
		content: "package season\n" +
			"import (\"encoding/json\"; \"io\")\n" +
			"type wireRecord struct {\n" +
			"  Active bool `json:\"activo\"`\n" +
			"  FirstCycle bool `json:\"primeravez\"`\n" +
			"}\n" +
			"func decode(reader io.Reader) {\n" +
			"  decoder := json.NewDecoder(reader)\n" +
			"  var value wireRecord\n" +
			"  _ = decoder.Decode(&value)\n" +
			"}\n",
		diagnostic: "parses Legacy JSON outside the Legacy adapter",
	},
	{
		name: "detached encoder",
		content: "package season\n" +
			"import (\"encoding/json\"; \"io\")\n" +
			"type wireRecord struct {\n" +
			"  Page string `json:\"pagina\"`\n" +
			"  Days []string `json:\"dias\"`\n" +
			"}\n" +
			"func encode(writer io.Writer, value wireRecord) {\n" +
			"  encoder := json.NewEncoder(writer)\n" +
			"  _ = encoder.Encode(value)\n" +
			"}\n",
		diagnostic: "serializes Legacy JSON outside the Legacy adapter",
	},
	{
		name: "marshal function alias",
		content: "package season\n" +
			"import codec \"encoding/json\"\n" +
			"type wireRecord struct {\n" +
			"  Status int `json:\"estado\"`\n" +
			"  Total *int `json:\"totalcap\"`\n" +
			"}\n" +
			"func encode(value wireRecord) { marshal := codec.Marshal; _, _ = marshal(value) }\n",
		diagnostic: "serializes Legacy JSON outside the Legacy adapter",
	},
}

func TestRunRejectsLegacyJSONDecoderAndEncoderBypasses(t *testing.T) {
	t.Parallel()
	for _, tt := range legacyJSONBypassCases {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			root := t.TempDir()
			file := "internal/season/parallel_json.go"
			writeFile(t, root, file, tt.content)
			err := run(root)
			if err == nil {
				t.Fatal("expected Legacy JSON boundary violation")
			}
			message := filepath.ToSlash(err.Error())
			if !strings.Contains(message, file) || !strings.Contains(message, tt.diagnostic) {
				t.Fatalf("expected actionable diagnostic %q, got %v", tt.diagnostic, err)
			}
		})
	}
}

func TestRunRejectsSpanishFieldFromLegacyDecodeResult(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	file := "internal/season/decoded_wire.go"
	writeFile(t, root, file, `package season
import boundary "autoreas-bridge/internal/anime/legacy"
func page(payload []byte) string {
  raw, _, _, _ := boundary.Decode(payload)
  return raw.Pagina
}
`)

	err := run(root)
	if err == nil || !strings.Contains(filepath.ToSlash(err.Error()), "uses Spanish Legacy wire field Pagina outside the Legacy adapter") {
		t.Fatalf("expected decoded Spanish-field violation, got %v", err)
	}
}

func TestRunAllowsUnrelatedJSONDecodersAndEncoders(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	writeFile(t, root, "internal/season/english_json.go", `package season
import (
  "encoding/json"
  "io"
)
type record struct {
  SourceURL string `+"`json:\"source_url\"`"+`
  Progress float64 `+"`json:\"progress\"`"+`
}
func use(reader io.Reader, writer io.Writer, value record, payload []byte) {
  _ = json.Unmarshal(payload, &value)
  decoder := json.NewDecoder(reader)
  _ = decoder.Decode(&value)
  encoder := json.NewEncoder(writer)
  _ = encoder.Encode(value)
  _, _ = json.Marshal(value)
  _ = "Sin ver"
}
`)

	if err := run(root); err != nil {
		t.Fatalf("expected unrelated English JSON to pass, got %v", err)
	}
}
