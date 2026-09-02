# Sacar los 104 `.go` de la raíz — investigación y plan de migración

> ⚠️ **Documento de investigación, parcialmente superado.** Su análisis de qué exige Wails es
> correcto y sigue siendo la evidencia de fondo. Su **plan de migración (§4) no lo es**: la migración
> se ejecutó y se midió, y dos afirmaciones de este documento resultaron falsas (el paso
> `rm -rf frontend/wailsjs` es innecesario; el guard de versión de CI no detecta nada), además de
> faltarle el namespace de runtime `window.go.main` que rompía producción en silencio. Para ejecutar,
> usa **`plan-migracion-raiz-go-ejecutable.md`** y `docs/adr/018-desktop-shell-package.md`.

> **Repo:** `Disble/autoreas-bridge` · **Wails:** v2.15.0 · **Go:** 1.27
> **Fecha:** 2026-09-02
> **Estado del árbol analizado:** 104 archivos `.go` en la raíz (42 de producción + 62 de test), ~17.500 líneas, todos en `package main`.

---

## 1. Veredicto

**Te mintieron.** Wails v2 no obliga a nada de esto. Lo único que Wails v2 exige es:

> **un `package main` con `func main()` en el mismo directorio donde vive `wails.json`.**

Eso son **1–2 archivos**. Los otros **102** están en la raíz por decisión propia del proyecto, no por el framework. Es más: Wails **envía un ejemplo oficial** que hace exactamente lo contrario de lo que te dijeron.

---

## 2. La evidencia (código fuente de Wails v2.15.0, no folklore)

### 2.1 Lo que Wails SÍ obliga

`pkg/commands/build/base.go` → `CompileProject()` arma el comando de compilación así:

```go
commands.Add("build")
commands.Add("-buildvcs=false")
// ... tags, ldflags ...
commands.Add("-o"); commands.Add(compiledBinary)

cmd := exec.Command(compiler, commands.AsSlice()...)
cmd.Dir = b.projectData.Path      // <-- el directorio del wails.json
```

Fíjate en lo que **no** hay: ningún argumento de paquete. Es un `go build` pelado ejecutado con `cwd = directorio del proyecto`, así que compila **el paquete de ese directorio**. Lo mismo en `pkg/commands/bindings/bindings.go` (`GenerateBindings`), que hace `go build -tags bindings` con `workingDirectory = ProjectDirectory`.

**Conclusión:** el `package main` debe estar junto al `wails.json`. Punto. Nada más.

A eso se suma una restricción del propio Go, no de Wails: `//go:embed` no puede subir con `../`, así que el archivo que hace `//go:embed all:frontend/dist` debe vivir en un paquete cuyo directorio contenga a `frontend/dist`. **Pero ese paquete no tiene por qué ser `main`** (ver 2.3).

### 2.2 Lo que Wails NO obliga: el struct bindeado puede vivir en cualquier paquete

El propio test suite de Wails lo demuestra — `v2/internal/binding/binding_test/binding_conflicting_package_name_test.go`:

```go
package binding_test          // <-- NO es main

type HandlerTest struct{}
func (h *HandlerTest) StartingWithInt(_ int_package.SomeStruct) {}
// ...
b := binding.NewBindings(testLogger, []interface{}{&HandlerTest{}}, ...)
b.GenerateGoBindings(generationDir)

// y luego lee, exitosamente:
fs.ReadFile(os.DirFS(generationDir), "binding_test/HandlerTest.d.ts")
```

El generador (`internal/binding/generate.go`) hace literalmente:

```go
for packageName, structs := range store {
    packageDir := filepath.Join(baseDir, packageName)   // frontend/wailsjs/go/<paquete>/
```

y el `packageName` sale de `internal/binding/reflect.go`:

```go
structName := structType.Elem().Name()
pkgPath := strings.TrimSuffix(structType.Elem().String(), "."+structName)
// para *desktop.App  ->  "desktop"
```

Es decir: **el nombre corto del paquete Go se convierte en el namespace de los bindings**. Mover `App` a `internal/desktop` produce `frontend/wailsjs/go/desktop/App.js` en vez de `.../go/main/App.js`. Nada se rompe; cambia una ruta de import.

> **Ya lo tienes probado en tu propio repo:** tus DTOs de `internal/api/contracts` generan el namespace `contracts` en `models.ts`, y el frontend lo importa sin problema (`import type { contracts } from '../../../wailsjs/go/models'`). O sea, bindear tipos desde paquetes que no son `main` **ya funciona aquí, hoy, en producción**.

### 2.3 El ejemplo oficial de Wails que desmonta el argumento entero

`v2/examples/customlayout` (viene en el repo de Wails):

```
customlayout/
├── build/                       <- assets de build en la raíz
├── myfrontend/
│   ├── assets.go                <- package myfrontend  (!!)  el go:embed vive aquí
│   ├── index.html
│   └── src/
├── cmd/customlayout/
│   ├── main.go                  <- package main
│   ├── app.go
│   └── wails.json               <- el wails.json TAMBIÉN se movió
├── go.mod
└── README.md
```

`myfrontend/assets.go`:
```go
package myfrontend

import "embed"

//go:embed all:dist
var Assets embed.FS
```

`cmd/customlayout/wails.json`:
```json
{
  "build:dir":    "../../build",
  "frontend:dir": "../../myfrontend"
}
```

Y el README dice: *"This is an example project that shows how to use a custom layout. Run `wails build` in the `cmd/customlayout` directory."*

Las claves `build:dir`, `frontend:dir`, `wailsjsdir`, `assetdir` y `projectdir` existen en `internal/project/project.go` precisamente para esto. **Wails v2 tiene soporte de primera clase para layouts custom.**

---

## 3. Entonces, ¿qué te está atando de verdad?

Dos cosas, ambas tuyas:

1. **`.golangci.yml` → regla `wails-confined-to-edge`:**
   ```yaml
   files: ["**/internal/**"]
   deny:
     - pkg: "github.com/wailsapp/wails/v2"
       desc: "the Wails runtime must stay in the composition root (app.go/main.go)"
   ```
   Esta regla prohíbe explícitamente que cualquier paquete bajo `internal/` importe Wails. Como `App` usa el runtime de Wails (eventos, diálogos, control de ventana), **hoy no puede moverse a `internal/` sin tocar esta regla**. La intención de la regla es buena ("Wails solo en el borde"); solo hay que reconocer que el borde se muda de sitio.

2. **`ARCHITECTURE.md` línea 130 y `docs/architecture.md`**, que codifican "la raíz = composition root" como doctrina. Es doctrina escrita por el proyecto, no por Wails.

La regla se **enmienda**, no se derriba: sigue diciendo "Wails solo en el composition root", pero nombra el nuevo directorio.

---

## 4. Plan de migración

### Objetivo (Opción A — recomendada)

```
/main.go                 <- ÚNICO .go en la raíz: go:embed + func main()
/wails.json
/build/  /frontend/  /internal/  /cmd/  /tools/  /docs/  /openspec/
/internal/desktop/       <- los 103 archivos restantes, package desktop
```

Raíz: **de 104 archivos `.go` a 1**.

> **Por qué `internal/desktop` y no `cmd/bridge`:** es un solo `git mv`, no toca `wails.json`, no toca CI, no cambia desde dónde se ejecuta `wails build`, y el nombre corto del paquete (`desktop`) no colisiona con ningún paquete existente del repo. La variante "cero `.go` en la raíz" está en §4.4.

---

### Fase 0 — Red de seguridad (antes de mover un solo archivo)

El riesgo real de esta migración no es que no compile — es que **los bindings generados cambien de forma sin que nadie lo note**. Congela la superficie antes de tocar nada:

1. `go build ./... && go vet ./... && go test ./... -count=1` → verde.
2. `wails build` → verde. `bun --cwd=frontend run render:smoke` → verde.
3. **Congelar la superficie bindeada** (este es el guard clave):
   ```bash
   wails generate module
   cp frontend/wailsjs/go/main/App.d.ts   /tmp/baseline-App.d.ts
   cp frontend/wailsjs/go/models.ts       /tmp/baseline-models.ts
   ```
   Son 99 métodos exportados en `App`. Al final de la Fase 1, el diff contra el baseline debe ser **exclusivamente** `main` → `desktop` en los namespaces. Cualquier método que desaparezca o cualquier DTO que cambie de forma es un bug de la migración.
4. Abrir un ADR (`docs/adr/017-desktop-shell-package.md`) con la decisión y esta evidencia. El repo ya tiene cultura de ADR; sin él, dentro de tres meses alguien vuelve a decir "es que Wails obliga".

---

### Fase 1 — Mover el bloque completo (mecánica, 1 PR, cero cambios de API en Go)

**La clave de por qué esto es de bajo riesgo:** los 103 archivos se mueven **juntos y al mismo paquete**. Todas las referencias entre archivos siguen siendo intra-paquete, así que **ningún identificador no-exportado necesita exportarse**: los ~95 métodos no exportados de `App`, los ~127 símbolos de nivel superior, los helpers de test — todo sigue funcionando tal cual. No es un refactor, es una mudanza.

1. **Mover:**
   ```bash
   mkdir -p internal/desktop
   git mv $(ls *.go | grep -v '^main\.go$') internal/desktop/
   # incluye doc.go y main_options_test.go
   ```

2. **Renombrar el paquete** en los 103 archivos:
   ```bash
   perl -0pi -e 's/^package main$/package desktop/m' internal/desktop/*.go
   ```
   (`sd` no está instalado en este repo — ver `CLAUDE.md`.)

3. **Actualizar `doc.go`:**
   ```go
   // Package desktop wires the desktop shell composition root and Wails bindings.
   package desktop
   ```

4. **Mover `buildAppOptions` con el resto y exponer una sola entrada.** `buildAppOptions` referencia `app.startup`, `app.shutdown`, `app.onSecondInstanceLaunch` y `singleInstanceLockID`, todos no exportados — por eso se muda con ellos y **no hay que exportar nada de eso**. En `internal/desktop`:
   ```go
   // Options assembles the Wails application options for the bridge app.
   func Options(assets embed.FS) *options.App {
       return buildAppOptions(NewApp(), assets)
   }
   ```
   Y `main.go` en la raíz queda en ~15 líneas:
   ```go
   // Package main is the Wails entry point; the desktop shell lives in internal/desktop.
   package main

   import (
       "embed"
       "github.com/wailsapp/wails/v2"
       "autoreas-bridge/internal/desktop"
   )

   //go:embed all:frontend/dist
   var assets embed.FS

   func main() {
       if err := wails.Run(desktop.Options(assets)); err != nil {
           println("Error:", err.Error())
       }
   }
   ```
   `main_options_test.go` se muda con `buildAppOptions` y sigue probándolo directamente.

5. **Enmendar `.golangci.yml`** — la regla `wails-confined-to-edge` pasa a excluir el nuevo borde (depguard admite globs negados):
   ```yaml
   wails-confined-to-edge:
     files:
       - "**/internal/**"
       - "!**/internal/desktop/**"
     deny:
       - pkg: "github.com/wailsapp/wails/v2"
         desc: "the Wails runtime stays in the composition root (main.go + internal/desktop);
                inject runtime access into other internal packages instead"
   ```
   El resto de reglas (`domain-purity`, `contracts-are-ports`) siguen intactas y **siguen mordiendo**: `internal/anime/domain` y `internal/api/contracts` mantienen su prohibición explícita de Wails por línea propia.

6. **Regenerar bindings y actualizar el frontend** (9 archivos importan `App`, 1 usa el namespace `main`):
   ```bash
   bun --cwd=frontend run generate:bindings
   rg -l "wailsjs/go/main/App" frontend/src \
     | xargs perl -0pi -e 's#wailsjs/go/main/App#wailsjs/go/desktop/App#g'
   ```
   Y en `frontend/src/infrastructure/bridge-runtime-source/bridge-runtime-source.helpers.ts`:
   ```ts
   import type { desktop as wailsDesktop } from '../../../wailsjs/go/models';
   ```
   (7 usos de `wailsMain.` → `wailsDesktop.`)

7. **Actualizar `frontend/scripts/generate-wails-bindings.mjs`**, que verifica la salida por nombre de archivo:
   ```js
   export const requiredBindings = [
     'frontend/wailsjs/go/desktop/App.js',
     'frontend/wailsjs/go/desktop/App.d.ts',
     'frontend/wailsjs/go/models.ts',
     'frontend/wailsjs/runtime/runtime.js',
   ];
   ```
   Sin esto, el hook `postinstall` seguiría "pasando" con bindings inexistentes (recuerda: `wails generate module` sale con código 0 aunque falle — por eso el script verifica archivos).

8. **Documentación viva** (no toques el histórico): `ARCHITECTURE.md` (línea 130), `docs/architecture.md`, `AGENTS.md`, `CLAUDE.md`, `openspec/specs/**`. Los ~150 archivos bajo `openspec/changes/**` y los ADR ya aceptados son **registro histórico**: describen el árbol tal como era cuando se escribieron y **no deben reescribirse**. El ADR-017 nuevo es el que explica el cambio de rutas.

**Verificación de la Fase 1:**

```bash
go build ./... && go vet ./... && go test ./... -count=1
wails generate module
diff <(sed 's/\bmain\b/desktop/g' /tmp/baseline-App.d.ts) frontend/wailsjs/go/desktop/App.d.ts   # vacío
diff <(sed 's/namespace main/namespace desktop/' /tmp/baseline-models.ts) frontend/wailsjs/go/models.ts  # vacío
bun --cwd=frontend run typecheck && bun --cwd=frontend run test
wails build && bun --cwd=frontend run render:smoke
go run ./tools/checkarchitecture && go run ./tools/checkgofilesize && go run ./tools/checkgofmt
```

> **Nota sobre `lefthook.yml`:** los globs `"*.go"` de los jobs `gofmt` / `go-filesize` / `architecture` / `golangci-lint` / `sdd-gate` / `openapi` / `go-heavy` ya cubren rutas anidadas — el repo tiene cientos de `.go` bajo `internal/` y `tools/` y el gate corre sobre ellos hoy. No hace falta tocar los globs. Aun así, confírmalo con un commit de prueba tocando `internal/desktop/app.go` y `lefthook run pre-commit`: un job que deje de dispararse es una regresión silenciosa.
>
> **`tools/checkgofilesize/baseline.yaml` no necesita cambios:** `files: []` está vacío y `exclude_paths` no menciona la raíz. Pero ojo — el límite es 500 líneas efectivas y `app_download_test.go` (602 líneas) se muda tal cual; si hoy pasa, seguirá pasando, pero verifica que el contador no dependa de la ruta.

---

### Fase 2 — Romper el god-struct (opcional, incremental, varios PRs)

La Fase 1 saca la basura de la vista; **no la ordena**. Lo que queda es un `internal/desktop` con un struct `App` de ~110 campos de dependencia, 99 métodos exportados y 95 no exportados. Eso sigue siendo un god-object; la diferencia es que ahora está en un sitio donde se puede partir sin pelearse con Wails.

Los archivos ya vienen agrupados por dominio — el prefijo hace el trabajo:

| Dominio | Archivos de producción |
|---|---|
| `season` | 10 |
| `runtime` (editor / events / create / services) | 6 |
| `download` | 6 |
| `notification` | 4 |
| `backup` | 4 |
| `capture` | 2 |
| sueltos (`activity_write`, `api_address`, `desktop_actions`, `preferences`, `missed_schedule`, `startup_runtime`, `defaults`, `app.go`) | 8 |

**Opción 2a — Fachada (frontend intacto).** `App` sigue siendo el único struct bindeado en `internal/desktop`, pero cada grupo se muda a `internal/desktop/<dominio>` como servicio propio con **solo las dependencias que usa**, y los métodos de `App` quedan como delegaciones de tres líneas. El namespace de bindings sigue siendo `desktop`, así que **el frontend no se toca**. Es la vía barata y se puede hacer un dominio por PR.

**Opción 2b — Varios structs bindeados (la que mata el god-struct de verdad).** Wails acepta `Bind: []any{app, seasonAPI, downloadAPI, ...}` y genera un archivo por struct:
```
frontend/wailsjs/go/desktop/App.js
frontend/wailsjs/go/seasonui/SeasonAPI.js
frontend/wailsjs/go/downloadui/DownloadAPI.js
```
Los imports del frontend se vuelven más precisos y el acoplamiento baja de verdad. Coste: un PR por dominio, cada uno tocando los adaptadores de `frontend/src/infrastructure/`.

> **⚠️ Trampa de la Fase 2 — colisión de namespaces.** El generador usa el **nombre corto** del paquete (`getPackageName` en `internal/binding/reflect.go` hace `strings.Split(in, ".")[0]`). Si creas `internal/desktop/season` y también bindeas tipos de `internal/season`, **ambos emiten `export namespace season` en el mismo `models.ts`** y se pisan. Por eso los subpaquetes de la Fase 2 necesitan nombres cortos únicos en todo el repo: `seasonui`, `downloadui`, `notificationui` — o mantén los DTOs en el paquete padre `desktop`. Wails tiene un test dedicado a este escenario (`binding_conflicting_package_name_test.go`), lo cual dice bastante sobre la frecuencia con la que muerde.

---

### 4.4 Variante B — cero archivos `.go` en la raíz

Si quieres la raíz **completamente** limpia, replica el layout `customlayout` oficial:

```
/cmd/bridge/{main.go, wails.json}      <- build:dir "../../build", frontend:dir "../../frontend"
/frontend/assets.go                    <- package webassets, //go:embed all:dist
/internal/desktop/                     <- el resto
```

**Coste real:** `wails dev` y `wails build` pasan a ejecutarse desde `cmd/bridge`; hay que actualizar `frontend/scripts/generate-wails-bindings.mjs` (calcula `projectRoot` como dos niveles arriba de `frontend/scripts/`), fijar `wailsjsdir` para que los bindings sigan cayendo en `frontend/wailsjs/`, y revisar cada script de `scripts/` y cada job de CI que asuma el cwd. **Beneficio marginal sobre la Opción A:** un archivo. Yo lo dejaría documentado como posible y no lo haría — salvo que en el futuro quieras un segundo binario con su propio `wails.json`, que es justo el caso de uso para el que existe este layout.

---

## 5. Resumen de riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Se pierde un método bindeado en la mudanza | Baja | Diff contra `/tmp/baseline-App.d.ts` (99 métodos) |
| Un DTO cambia de forma en `models.ts` | Baja | Diff contra `/tmp/baseline-models.ts` |
| Un job de lefthook deja de dispararse | Media | `lefthook run pre-commit` tocando `internal/desktop/*.go` |
| El hook `postinstall` "pasa" sin generar bindings | **Alta si olvidas el paso 7** | Actualizar `requiredBindings` |
| Colisión de namespaces (solo Fase 2) | Media | Nombres cortos únicos: `seasonui`, `downloadui`, … |
| `golangci-lint` bloquea el import de Wails | Certeza | Enmendar `wails-confined-to-edge` (paso 5) |

**Lo que esta migración NO puede romper:** nada del runtime. No se toca lógica, no se renombra ningún símbolo, no se cambia ninguna firma. Si compila y los bindings hacen diff limpio, es correcto por construcción.

---

## 6. Advertencia honesta sobre esta investigación

Todo lo anterior sale de leer el código fuente de Wails v2.15.0 (`git clone --branch v2.15.0`) y de inspeccionar tu repo estáticamente. **No pude compilar tu proyecto** para verificarlo empíricamente: el entorno donde corrí esto no tiene acceso a `proxy.golang.org`, así que no pude resolver dependencias como `modernc.org/sqlite`. Las afirmaciones sobre lo que Wails exige están respaldadas por el código citado (rutas y funciones concretas, verificables en tu propia máquina), pero el "compila y pasa el gate" tienes que probarlo tú en la Fase 0 y al cierre de la Fase 1.

---

## Fuentes

- `wailsapp/wails` v2.15.0 — `v2/pkg/commands/build/base.go` (`CompileProject`), `v2/pkg/commands/bindings/bindings.go` (`GenerateBindings`), `v2/internal/binding/generate.go` (`GenerateGoBindings`), `v2/internal/binding/reflect.go` (`getMethods`, `getPackageName`), `v2/internal/project/project.go` (claves de `wails.json`), `v2/internal/binding/binding_test/binding_conflicting_package_name_test.go`, `v2/examples/customlayout/**`
- Documentación Wails v2 — https://wails.io/docs/howdoesitwork/
- Repo analizado — https://github.com/Disble/autoreas-bridge
