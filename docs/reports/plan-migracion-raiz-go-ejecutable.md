# Plan ejecutable — sacar los 103 `.go` innecesarios de la raíz

> **Complementa** `docs/reports/plan-migracion-raiz-go.md` (investigación sobre qué exige Wails).
> Aquel documento explica **por qué se puede**. Este dice **qué pasa cuando se hace**, porque
> **la migración se ejecutó y se midió**, no se razonó.
>
> **Worktree:** `autoreas-bridge-worktrees/raiz-go` · **Rama:** `refactor/desktop-shell-package`
> **Base:** `dev@f435367` · **Toolchain medido:** `go1.27.0 windows/amd64`, Wails v2.15.0
> **Fecha:** 2026-09-02

---

## 0. Método

La versión anterior de este documento presentaba cinco "huecos" como hechos. Tres lo eran (grep),
**dos eran afirmaciones de memoria disfrazadas de hallazgo**. Una decisión de esta escala no se toma
así.

Cada afirmación cargante está ahora escrita como **hipótesis con predicado de refutación definido
antes de medir**, y con el resultado. Dos cambiaron de veredicto al medirse, y una **abrió un defecto
preexistente en CI** que no tiene nada que ver con esta migración.

**La migración completa se ejecutó en el worktree.** Los números de §3 y §6 son lecturas, no
predicciones.

---

## 1. Resultado de la ejecución

| Medición | Resultado |
|---|---|
| `.go` en la raíz | **104 → 1** (`main.go`, 21 líneas) |
| Archivos en `internal/desktop/` | 104 (103 mudados + `options.go` nuevo) |
| Forma del diff en git | 102 `R` + 2 `A` + 1 `D` + 13 `M` |
| `go build ./...` | exit 0 |
| `go vet -p 4 ./...` | exit 0 |
| `go test ./... -count=1` | exit 0 · `ok autoreas-bridge/internal/desktop 4.790s` |
| `golangci-lint run ./...` (tras enmendar) | **0 issues** |
| `tsc --noEmit` | limpio (**y no prueba nada aqui — ver H7**) |
| Suite del frontend | **263/263 archivos, 2335/2335 tests** |
| `wails build` | binario construido en 44s |
| `render:smoke` | **pasa** — Today, Catalog y Downloads en todas las rutas |
| Métodos bindeados | **99 antes, 99 después** |
| Clases en `models.ts` | **98 antes, 98 después** |
| `App.d.ts` normalizado `main.`→`desktop.` | **idéntico byte a byte** |
| `App.js` normalizado `['main']`→`['desktop']` | **idéntico byte a byte** |

Ningún símbolo no exportado necesitó exportarse. La única API nueva es `desktop.Options(embed.FS)`;
la única firma cambiada es `buildAppOptions`, que gana un parámetro y es intra-paquete.

---

## 2. Las hipótesis, medidas

### H1 — El estampado de versión se rompe en silencio · **CONFIRMADA, y peor de lo que decía**

**Hipótesis.** `app_backup.go:18` declara `var bridgeVersion = "dev"` en `package main`. Al mudarlo,
`-ldflags "-X main.bridgeVersion=…"` deja de resolver y Go no avisa.

**Predicado de refutación.** *Refutada si* `go build` con una ruta `-X` inexistente devuelve exit ≠ 0
o escribe algo en stderr.

**Medición** (módulo de prueba mínimo, `go1.27.0`):

| Caso | `-X` | exit | stderr | valor en runtime |
|---|---|---|---|---|
| A (control) | ruta correcta | 0 | vacío | `REAL` |
| B | paquete inexistente | 0 | vacío | `dev` |
| C | paquete real, símbolo inexistente | 0 | vacío | `dev` |
| **D** | **`main.Version` con la var ya mudada** | **0** | **vacío** | **`dev`** |

El caso D es exactamente este escenario. **Confirmada.** El control A prueba que el experimento sabe
detectar un estampado real, así que los `dev` de B/C/D no son un artefacto del montaje.

#### H1b — «pero CI lo caza» · **REFUTADA. El guard de CI no sirve.**

La versión anterior afirmaba que los dos workflows fallan ruidosamente porque leen el binario de
vuelta. **Falso.** Ambos hacen:

```bash
go version -m build/bin/autoreas-bridge | grep "bridgeVersion=${VERSION}"
```

`go version -m` **devuelve la línea `build -ldflags="…"`**, es decir el flag que el propio job acaba
de pasar — no el valor del símbolo. Medición sobre el binario **roto** del caso D:

```
--- runtime ---            dev
--- guard de CI ---        build  -ldflags="-X main.Version=9.9.9"
>>> EL GUARD PASA
```

**El guard pasa sobre un binario que reporta `dev`.** Es un guard que no puede fallar, y
`AGENTS.md:93` lo lista precisamente entre los que existen *"porque su fallo es silencioso"*.

> **Esto es un defecto preexistente de `main`, no un efecto de esta migración.** Hoy protege por
> accidente porque la ruta `main.bridgeVersion` es correcta. Merece su propio arreglo, independiente
> de que esta mudanza se haga o no.

#### H1c — *(mi primer predicado de reemplazo también era falso)* · **`go tool nm` NO sirve aquí**

Propuse `go tool nm <bin> | grep -F "<ruta>"` y **lo medí** — pero en un módulo de prueba compilado
con `go build` pelado, no en el artefacto real. Sobre el binario de verdad:

```
=== PREDICADO H1: el simbolo debe EXISTIR en el binario ===
reading build/bin/autoreas-bridge.exe: no symbols
```

**Causa, leída del propio binario:** `wails build` añade sus flags a los tuyos —
`-ldflags="-X …bridgeVersion=… -w -s -H windowsgui"`. El `-s` borra la tabla de símbolos.

El guard que yo había escrito **habría fallado en todos los builds**. Un guard que grita siempre se
desactiva igual de rápido que uno que nunca grita: los dos modos son el mismo defecto.

> **La lección:** un experimento correcto sobre el objeto equivocado da un resultado correcto y una
> conclusión falsa. El control positivo pasaba; lo que faltaba era que el sujeto fuera el artefacto
> que se envía.

#### Predicado válido, medido sobre el binario real

`strings` a secas tampoco vale: `go version -m` demostró que la cadena de `-ldflags` queda incrustada,
así que el literal aparece **también** en el binario roto (2 veces, ambas dentro de esa línea). Pero
nunca como línea completa. Con coincidencia exacta de línea:

| Binario | `strings -a \| grep -Fxc "<version>"` |
|---|---|
| roto (`-X main.bridgeVersion=0.0.0-BROKEN`) | **0** |
| correcto (`-X …/internal/desktop.bridgeVersion=0.0.0-GOOD`) | **1** |

```bash
test "$(strings -a build/bin/autoreas-bridge.exe | grep -Fxc "${VERSION}")" -ge 1   || { echo "::error::el estampado no ocurrio; los backups de este build reportarian 'dev'"; exit 1; }
```

**Y prevención, no solo detección:** derivar la ruta en vez de escribirla a mano. `go list` falla
ruidosamente si el paquete se mueve otra vez (medido: `stat …/internal/noexiste: directory not
found`, exit ≠ 0).

```bash
PKG=$(go list -f '{{.ImportPath}}' ./internal/desktop) || exit 1
wails build -ldflags "-X ${PKG}.bridgeVersion=${VERSION}"
```

**Acción:** los tres sitios de llamada pasan a la ruta nueva (derivada con `go list`), **y** el
readback de ambos workflows se sustituye por el `grep -Fxc`. Lo segundo hay que hacerlo con migración
o sin ella: hoy el guard no puede fallar.

---

### H2 — Actualizar solo el script deja la suite del frontend en rojo · **CONFIRMADA**

**Predicado de refutación.** *Refutada si* tras cambiar únicamente `requiredBindings` en
`generate-wails-bindings.mjs` el archivo de test pasa.

**Medición.**

```
scripts/__tests__/generate-wails-bindings.test.mjs:31:37
  - "frontend/wailsjs/go/main/App.js"
  + "frontend/wailsjs/go/desktop/App.js"
Test Files  1 failed (1)     Tests  1 failed | 2 passed (3)
```

Tras alinear también el test: **3 passed (3)**. Confirmada: son **dos** archivos, no uno.

---

### H3 — `wails generate module` no borra los bindings obsoletos · **REFUTADA**

**Predicado de refutación.** *Refutada si* un directorio de bindings sembrado a mano desaparece tras
regenerar.

**Medición, dos veces:**

1. Sembrado `frontend/wailsjs/go/bogus/App.d.ts` + `.js` → `wails generate module` → **`bogus/`
   desapareció.**
2. Escenario real, sin ningún `rm` manual: antes `go/main/`, tras la migración y regenerar →
   **`go/desktop/` y `go/main/` ya no está.**

**Refutada.** El paso `rm -rf frontend/wailsjs/go` **se elimina del plan**: es innecesario. Era una
afirmación mía de memoria y era falsa.

---

### H4/H5 — Ningún guard detecta referencias muertas en docs y specs vivas · **CONFIRMADA**

**Predicado de refutación.** *Refutada si* algún checker del gate sale ≠ 0 por citar `app.go:409`
cuando `./app.go` ya no existe.

**Medición, con el árbol ya migrado** (`ls app.go` → no existe; `device.md:20` sigue diciendo
`app.go:409`):

| Checker | exit |
|---|---|
| `checkarchitecture` | 0 |
| `checkgofmt` | 0 |
| `checkgofilesize` | 0 |
| `checkopenapi` | 0 |

**Confirmada: nada lo detecta.** (`checksdd` y `checktruncation` salen ≠ 0 por motivos preexistentes
y ajenos — múltiples cambios SDD activos y falta de `-db`.) Las referencias son responsabilidad
manual del paso 5.7. Archivos afectados:

- `openspec/specs/notifications/device.md:20-21` → `app.go:409`, `app.go:375`
- `openspec/specs/notifications/observability-forwarding.md:21` → `app.go:99`
- `openspec/specs/episode-vocabulary/spec.md:22, 54-55` → cuatro rutas
- `docs/mutation-testing.md:161, 167` → `app_defaults.go:43:26`

Al no haber guard, cámbialas por **nombres de símbolo** en vez de `archivo:línea`: los números ya
están podridos hoy y nadie se entera.

---

### H7 — *(no estaba en ninguna lista; aparecio al CORRER la suite)* El namespace vive en tres formas · **CONFIRMADA**

La primera pasada del gate dio **11 archivos y 37 tests rojos**, con
`TypeError: Cannot read properties of undefined (reading 'App')`. La causa no era el Go: era que
`grep 'wailsjs/go/main'` — la busqueda de todo el plan — **solo ve una de las tres formas** en que el
namespace aparece.

| Forma | Como se busca | Archivos |
|---|---|---|
| Ruta de import | `wailsjs/go/main/App` | 9 |
| Namespace de tipos | `main as wailsMain` desde `models.ts` | 1 |
| **Global de runtime** | `window.go?.main?.App` | **16** |

Los 16 incluyen **dos archivos de produccion**:

- `frontend/src/infrastructure/wails-bindings.helpers.ts:13` — `hasGoBinding`, el accesor compartido
  que usan **todos** los adaptadores.
- `frontend/src/infrastructure/observability-log-source/observability-log-source.helpers.ts:17, 41`

Mas 13 archivos de test con mocks `window.go = { main: { App: … } }` y **la declaracion de tipo**
`frontend/src/test/setup.ts:8`.

**Por que `tsc` no lo caza.** Esa declaracion de tipo es la que define `window.go`. Mientras siga
diciendo `main?: {…}`, `window.go?.main?.App` es un tipo perfectamente valido: **el typecheck salio
limpio con el runtime roto**. Lint tampoco lo ve. Go tampoco. Lo detecto **unicamente** la suite de
tests, y por suerte, porque los dos archivos de produccion afectados tienen cobertura.

**El modo de fallo si se escapa** no es un crash: `hasGoBinding` devuelve `false` para siempre y cada
adaptador **degrada en silencio**. Es el fallo que `CLAUDE.md` 18b describe — proceso vivo, app
inutil.

**Correccion, medida.** Tras arreglar los 16 archivos: **263/263 archivos, 2335/2335 tests**, sin una
cuarta forma escondida.

> **Al sustituir, anclar con `main`.** `domain: {` contiene `main: {` como substring; sin la
> frontera de palabra, un `perl -0pi -e` destroza `overview-panel.constants.ts:85`. Verificado con un
> control explicito tras la sustitucion.

**Busqueda correcta para el plan** (las tres formas, no una):

```bash
grep -rn "wailsjs/go/main\|go?\.main\|\['go'\]\['main'\]\|as wailsMain" frontend/src frontend/scripts
```

---

### H6 — *(surgida al medir)* El predicado de diff del gate anterior daba falso positivo

El gate que yo mismo había escrito exigía que `diff` de `models.ts` saliera **vacío** tras normalizar
`main`→`desktop`. **No sale vacío en una migración correcta.**

**Causa medida.** El generador emite los namespaces en orden alfabético:

```
baseline: contracts logger main
migrado:  contracts desktop logger
```

`desktop` cae antes que `logger`; `main` caía después. El bloque entero se reordena y `diff` reporta
~66 líneas movidas. **Comparado como conjunto de líneas, es idéntico** — y el conteo de clases
(98 → 98) y de métodos (99 → 99) no se mueve.

Un gate que grita en una migración correcta se desactiva a la tercera. Predicados corregidos en §6.

---

## 3. Inventario

**Necesario: 1 archivo.** `main.go`, por dos restricciones verificadas: Wails ejecuta `go build` con
`cwd = directorio del wails.json` sin argumento de paquete, y `//go:embed` no puede subir con `../`.

**Innecesarios: 103.** Todos `package main` por decisión del proyecto. Se mudan **juntos al mismo
paquete**, así que toda referencia entre ellos sigue siendo intra-paquete. No es un refactor: es una
mudanza — y los 99 métodos bindeados idénticos lo confirman.

Ningún `.go` de la raíz lleva `//go:build`. Los dos tests que tocan disco (`app_backup_test.go`,
`app_backup_import_test.go`) derivan rutas de `t.TempDir()`: insensibles a la mudanza.

---

## 4. Fase 0 — Congelar la superficie

```bash
BASE="$SCRATCH/baseline"; mkdir -p "$BASE"
go build ./... && go vet ./... && go test ./... -count=1
wails generate module
cp frontend/wailsjs/go/main/App.d.ts "$BASE/" && cp frontend/wailsjs/go/main/App.js "$BASE/"
cp frontend/wailsjs/go/models.ts "$BASE/"
grep -c '^export function' "$BASE/App.d.ts"   # 99
grep -c '^	export class'  "$BASE/models.ts"  # 98
```

En un worktree limpio `frontend/dist` no existe y el `//go:embed` no resuelve. Basta un stub:
`mkdir -p frontend/dist && printf '<!doctype html>' > frontend/dist/index.html`. Los bindings salen
de reflexión sobre los structs, no del bundle.

Abrir `docs/adr/017-desktop-shell-package.md`. Sin ADR, en tres meses alguien vuelve a decir "es que
Wails obliga".

---

## 5. Fase 1 — La mudanza

### 5.1 Mover y renombrar

```bash
mkdir -p internal/desktop
git mv $(ls *.go | grep -v '^main\.go$') internal/desktop/
perl -0pi -e 's/^package main$/package desktop/m' internal/desktop/*.go
test "$(grep -l '^package main$' internal/desktop/*.go | wc -l)" -eq 0 || echo "!! EL RENOMBRE NO SE APLICO"
```

`sd` no está instalado aquí (`CLAUDE.md`). La línea de verificación no es opcional —
`docs/postmortems/postmortem-silent-no-ops.md`.

### 5.2 Partir `main.go`

`buildAppOptions` y `singleInstanceLockID` viven en `main.go`, que **se queda**, pero
`main_options_test.go` se muda: hay que moverlos a `internal/desktop/options.go` o el test no
compila. `buildAppOptions` referencia `app.startup`, `app.shutdown` y `app.onSecondInstanceLaunch`,
todos no exportados — por eso se mudan con ellos y no hay que exportar nada.

```go
// internal/desktop/options.go
const singleInstanceLockID = "autoreas-bridge-single-instance"

// Options assembles the Wails application options for the bridge app.
func Options(assets embed.FS) *options.App { return buildAppOptions(NewApp(), assets) }

func buildAppOptions(app *App, assets embed.FS) *options.App { /* … igual que antes … */ }
```

`buildAppOptions` gana `assets embed.FS` (hoy captura la global de `main.go`).
`main_options_test.go` pasa a llamarlo con `embed.FS{}` y añade el import `"embed"`.

La raíz queda en 21 líneas: doc comment, `//go:embed`, `var assets`, y
`wails.Run(desktop.Options(assets))`.

### 5.3 Enmendar `.golangci.yml`

```yaml
wails-confined-to-edge:
  files:
    - "**/internal/**"
    - "!**/internal/desktop/**"
  deny:
    - pkg: "github.com/wailsapp/wails/v2"
      desc: "the Wails runtime stays in the composition root (main.go + internal/desktop);
             inject runtime access into other internal packages instead of importing Wails there"
```

**Medido, antes y después.** Sin la enmienda, depguard bloquea exactamente 5 imports en 4 archivos
(`app.go:10`, `app_defaults.go:28`, `app_lifecycle_test.go:9`, `options.go:6`, `options.go:7`) y nada
más — ningún otro linter se queja de la mudanza. Con la enmienda: **0 issues**. `domain-purity` y
`contracts-are-ports` siguen mordiendo por línea propia.

### 5.4 Estampado de versión (H1 + H1b)

```bash
perl -0pi -e 's{-X main\.bridgeVersion=}{-X autoreas-bridge/internal/desktop.bridgeVersion=}g' \
  .github/workflows/build-windows.yml .github/workflows/build-linux.yml
```

Y a mano: `.claude/skills/bridge-release/SKILL.md:150-151, 173`, el comentario de
`internal/desktop/app_backup.go:13`, y los comentarios de ambos workflows que citan `app_backup.go`
por ruta.

**Además, sustituir el readback vacuo de los dos workflows** por el predicado `go tool nm` de H1b.
Ese cambio vale por sí solo.

### 5.5 Frontend

```bash
grep -rl "wailsjs/go/main/App" frontend/src | xargs perl -0pi -e 's#wailsjs/go/main/App#wailsjs/go/desktop/App#g'
perl -0pi -e 's#import type \{ main as wailsMain \}#import type { desktop as wailsDesktop }#; s#\bwailsMain\.#wailsDesktop.#g' \
  frontend/src/infrastructure/bridge-runtime-source/bridge-runtime-source.helpers.ts
```

Eso cubre **solo la forma 1**. Hay que hacer tambien la forma 3 (H7), en 16 archivos:

```bash
FILES=$(grep -rl "go?\.main\|window\.go = {" frontend/src --include=*.ts --include=*.tsx; echo frontend/src/test/setup.ts)
echo "$FILES" | sort -u | xargs perl -0pi -e   's/go\?\.main\?\./go?.desktop?./g; s/main\?: \{/desktop?: {/g; s/^(\s*)main(: \{)/${1}desktop${2}/gm'
grep -c "domain: {" frontend/src/features/season/ui/OverviewPanel/overview-panel.constants.ts  # control: 1
```

No olvidar `frontend/src/test/setup.ts:8`, la declaracion de tipo: mientras diga `main?`, **`tsc`
seguira pasando con el runtime roto**.

Medido: 9 archivos en la forma 1, 16 en la forma 3, 0 referencias viejas restantes en ninguna de las
tres, `tsc --noEmit` limpio y suite **263/263**.

> **No hace falta `rm -rf frontend/wailsjs/go`** — H3 refutada.

### 5.6 El generador **y su test** (H2)

`frontend/scripts/generate-wails-bindings.mjs:11-12` **y**
`frontend/scripts/__tests__/generate-wails-bindings.test.mjs:32-33`. Los dos, o la suite queda roja.

### 5.7 Documentación viva (H4/H5 — ningún guard la cubre)

| Archivo | Qué cambia |
|---|---|
| `ARCHITECTURE.md:130` | "composition root (`app.go`/`main.go`)" → "`main.go` + `internal/desktop`" |
| `docs/architecture.md` | Misma doctrina |
| `AGENTS.md`, `CLAUDE.md` | Referencias a la raíz como composition root |
| `docs/mutation-testing.md:161, 167` | `app_defaults.go` → `internal/desktop/app_defaults.go` |
| `openspec/specs/notifications/device.md:20-21` | `app.go:409`, `app.go:375` |
| `openspec/specs/notifications/observability-forwarding.md:21` | `app.go:99` |
| `openspec/specs/episode-vocabulary/spec.md:22, 54-55` | Cuatro rutas |
| `docs/adr/017-desktop-shell-package.md` | **Nuevo** |

Comprobado que **es seguro** editar `ARCHITECTURE.md:130`:
`frontend/scripts/__tests__/architecture-docs-and-artifacts.test.mjs` lee ese archivo pero solo pinea
frases sobre barrels.

**No tocar** `openspec/changes/**` ni los ADR aceptados: son registro histórico.

---

## 6. Gate de verificación (predicados corregidos por H6)

```bash
go build ./... && go vet -p 4 ./... && go test ./... -count=1
golangci-lint run ./...                      # 0 issues
wails generate module

# App.d.ts y App.js: identidad exacta tras normalizar el namespace
diff <(sed 's/\bmain\./desktop./g; s/{main}/{desktop}/' "$BASE/App.d.ts") frontend/wailsjs/go/desktop/App.d.ts
diff <(sed "s/\['main'\]/['desktop']/g"                 "$BASE/App.js")   frontend/wailsjs/go/desktop/App.js

# models.ts: INSENSIBLE AL ORDEN -- el generador reordena los namespaces alfabeticamente (H6)
diff <(sed 's/^export namespace main {/export namespace desktop {/' "$BASE/models.ts" | sort) \
     <(sort frontend/wailsjs/go/models.ts)

# Inventario: los numeros que de verdad importan
test "$(grep -c '^export function' frontend/wailsjs/go/desktop/App.d.ts)" -eq 99
test "$(grep -c '^	export class'  frontend/wailsjs/go/models.ts)"        -eq 98

# H7: las TRES formas del namespace, no solo la ruta de import. tsc NO cubre esto.
! grep -rn "wailsjs/go/main\|go?\.main\|\['go'\]\['main'\]\|as wailsMain" frontend/src frontend/scripts

bun --cwd=frontend run typecheck && bun --cwd=frontend run test   # 263/263, 2335/2335

# H1: el simbolo de -X tiene que EXISTIR en el binario. `go version -m` no lo prueba.
wails build -ldflags "-X autoreas-bridge/internal/desktop.bridgeVersion=0.0.0-test"
go tool nm build/bin/autoreas-bridge.exe | grep -qF " autoreas-bridge/internal/desktop.bridgeVersion" \
  || echo "!! el estampado NO ocurrio"

bun --cwd=frontend run render:smoke
lefthook run pre-commit
```

**Rollback:** `git revert` del commit de mudanza. Sin migración de datos, sin cambio de esquema, sin
estado persistido.

---

### H8 — *(descubierta por el gate real)* Salir de `package main` publica la superficie exportada

`revive` no comprueba un paquete `main`. En `package desktop` sí: **36 declaraciones** (26 metodos
bindeados de `App` + 10 DTOs del editor) pasaron a ser superficie publica sin documentar. Y el gate
corre **dos** perfiles de golangci-lint (`scripts/lint.ps1 -Profile all`): `.golangci.yml` y el
compilado a medida con `.golangci.dlinter.yml`, que es el que lleva revive. **`golangci-lint run
./...` a secas solo ejercita el primero y sale limpio** — otra vez el objeto equivocado.

Tocar 24 archivos del frontend ademas heredo su deuda `dharness` acumulada (17 JSDoc + 7 valores con
la supresion `role-file-shape` que `download-runtime-source.helpers.ts` ya usaba), porque el gate
lintea `{staged_files}`. Adopcion incremental funcionando como esta disenada.

**Y `dharness check` no puede correr desde un git hook dentro de un worktree**: `GIT_DIR` apunta a
`.git/worktrees/<n>` y resuelve `frontend/frontend`. Pasa en solitario. Ver ADR-018.

---

## 7. Riesgos, con probabilidad medida

| Riesgo | Estado | Detectado por |
|---|---|---|
| Build estampa `dev` en silencio (H1) | **Confirmado**; certeza si se omite 5.4 | **Nada hoy** — ni local ni CI (H1b). Arreglar con `go tool nm` |
| El guard de versión de CI no puede fallar (H1b) | **Confirmado**; defecto preexistente | Ninguno. Independiente de esta migración |
| Suite del frontend roja (H2) | **Confirmado**; certeza si se omite 5.6 | `bun run test` |
| Bindings obsoletos sobreviven (H3) | **Refutado** | — (paso eliminado) |
| Specs vivas citando rutas muertas (H4/H5) | **Confirmado** | **Nada**: 4 checkers salen 0 |
| **Namespace runtime `window.go.main` sin migrar (H7)** | **Confirmado**; 37 tests rojos | **Solo la suite de tests.** Ni `tsc`, ni lint, ni Go |
| Falso positivo del gate por reordenamiento (H6) | **Confirmado** | Predicado corregido en §6 |
| `golangci-lint` bloquea Wails | Certeza, 5 issues exactos | El gate. Paso 5.3 |
| **Guard de estampado que grita siempre (H1c)** | **Confirmado** en mi primer intento | Predicado `grep -Fxc`, medido 0 vs 1 |
| Se pierde un método bindeado | **No ocurrió**: 99 → 99, 98 → 98 | Predicados de §6 |

**Lo que esta migración no rompe:** nada del runtime, medido. `go build`, `go vet`, la suite completa
de Go, `golangci-lint` y `tsc` salen limpios, y la superficie bindeada es byte-idéntica salvo el
namespace.

---

## 8. Fase 2 — Partir el god-struct: fuera de alcance

Queda un `internal/desktop` con un `App` de ~110 campos, 99 métodos exportados y 95 no exportados.
Sigue siendo un god-object; ahora se puede partir sin pelearse con Wails.

**No encadenarla.** Mezclarla destruye la única propiedad que hace segura a la Fase 1: que la
superficie bindeada sea idéntica salvo el namespace. Con cambios de API en el mismo PR, un método que
desaparece del diff deja de distinguirse de uno que se movió a propósito. El informe previo (§4,
Fase 2) documenta las dos variantes y la trampa de colisión de namespaces; sigue vigente.

---

## 9. Variante B (cero `.go` en la raíz) — no recomendada

`cmd/bridge/{main.go, wails.json}` + `frontend/assets.go`, replicando el ejemplo oficial
`customlayout`. Coste: `wails dev`/`wails build` cambian de cwd,
`frontend/scripts/generate-wails-bindings.mjs:7` calcula `projectRoot` dos niveles arriba de
`frontend/scripts/` y dejaría de apuntar al `wails.json`, hay que fijar `wailsjsdir`, y ambos
workflows asumen el cwd de la raíz. **Beneficio sobre la Opción A: un archivo.** Solo vale si algún
día hace falta un segundo binario con su propio `wails.json`.
