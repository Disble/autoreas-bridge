# Política de Tamaño de Archivo (File Size Policy)

## Objetivo

Mantener la complejidad de cada archivo fuente bajo control mediante una regla transversal que aplica tanto a Go como a TypeScript/TSX:

- **Advertencia a 400 líneas efectivas.**
- **Falla dura (hard failure) por encima de 500 líneas efectivas.**

La regla incluye archivos de producción y tests. El objetivo final es **cero deuda permanente por encima de 500 líneas efectivas**.

## Qué significa "línea efectiva"

Una línea efectiva es una línea que contiene código o datos real. Se excluyen:

- Líneas en blanco.
- Líneas que solo contienen comentarios.

Esto aplica tanto al conteo de ESLint (`skipBlankLines: true`, `skipComments: true`) como al conteo del validador Go (`go/scanner` tokenizando el archivo y descartando comentarios).

## Arquitectura del enforcement

El repo usa dos herramientas independientes que comparten la misma semántica de conteo:

| Stack | Hard fail (>500) | Advertencia (400) | Comando |
|---|---|---|---|
| Go | `tools/checkgofilesize` | `tools/checkgofilesize` | `go run ./tools/checkgofilesize` |
| TS/TSX | ESLint `max-lines` | `frontend/scripts/check-file-size-warnings.mjs` | `bun --cwd="frontend" run filesize:warning` |

Ambas se ejecutan en `lefthook.yml`:

```yml
pre-commit:
  parallel: false
  jobs:
    - name: frontend-fallow
      run: bun --cwd="frontend" run fallow audit --quiet

    - name: frontend-filesize-warning
      run: bun --cwd="frontend" run filesize:warning

    - name: frontend-lint
      run: bun --cwd="frontend" run lint

    # ...

    - name: go-filesize
      run: go run ./tools/checkgofilesize

    - name: golangci-lint
      run: golangci-lint run
```

`frontend-filesize-warning` corre **antes** de `frontend-lint` para dar visibilidad temprana sin debilitar el error de ESLint. `go-filesize` corre **antes** de `golangci-lint` para fallar rápido en archivos nuevos o en crecimiento.

## Implementación Go

### Ubicación

- `tools/checkgofilesize/main.go`
- `tools/checkgofilesize/main_test.go`
- `tools/checkgofilesize/baseline.yaml`

### Semántica

1. Carga `tools/checkgofilesize/baseline.yaml`.
2. Recorre el repo buscando archivos `.go`, excluyendo `.git`, `node_modules`, `vendor`, paths del manifiesto y patrones como `*.pb.go` o `*_generated.go`.
3. Cuenta líneas efectivas con `go/scanner`, ignorando comentarios.
4. Si un archivo está entre 400 y 500 líneas efectivas, emite una **advertencia**.
5. Si un archivo supera las 500 líneas efectivas:
   - y NO está en baseline → falla como `new file over 500`.
   - y SÍ está en baseline pero supera su techo → falla como `baseline growth`.
   - y SÍ está en baseline y está dentro de su techo → pasa.

### Baseline

`tools/checkgofilesize/baseline.yaml` es un manifiesto temporal para deuda preexistente. El estado esperado es `files: []`. Si alguna entrada existe, debe:

- Tener un techo de no-crecimiento (`max_effective_lines`).
- Reducirse en el mismo PR donde el archivo se achica.
- Eliminarse en cuanto el archivo llegue a `<=500` líneas efectivas.

No se permite agregar entradas para archivos nuevos, renombrados o que ya cumplan la política.

## Implementación frontend

### Ubicación

- `frontend/eslint.config.js`
- `frontend/scripts/check-file-size-warnings.mjs`
- `frontend/scripts/__tests__/check-file-size-warnings.test.mjs`
- `frontend/package.json`

### Semántica

- `frontend/eslint.config.js` define la regla dura:

  ```js
  'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }]
  ```

- `frontend/scripts/check-file-size-warnings.mjs` ejecuta ESLint con una configuración override que pone `max-lines` en `warn` con `max: 400`, y reporta solo advertencias `>=400`.

- `frontend/package.json` expone el script:

  ```json
  "filesize:warning": "node ./scripts/check-file-size-warnings.mjs"
  ```

El script es **advisory-only**: nunca devuelve código de salida distinto de cero por advertencias de tamaño. La falla dura sigue siendo responsabilidad de ESLint en `bun --cwd="frontend" run lint`.

## Verificación manual

Comandos para probar la política localmente:

```bash
# Go: advertencias + validación
$ go run ./tools/checkgofilesize

# Go: tests del validador
$ go test ./tools/checkgofilesize

# Frontend: advertencias
$ bun --cwd="frontend" run filesize:warning

# Frontend: falla dura ESLint
$ bun --cwd="frontend" run lint

# Todo
$ go test ./...
$ bun --cwd="frontend" run test
```

## Casos de prueba vivos

Para comprobar que los umbrales funcionan realmente:

- Un archivo TS de **401 líneas efectivas** debe aparecer en `bun --cwd="frontend" run filesize:warning`.
- Un archivo TS de **501 líneas efectivas** debe fallar `bun --cwd="frontend" run lint`.
- Un archivo Go de **502 líneas efectivas** debe fallar `go run ./tools/checkgofilesize` con `new file over 500`.

Después de probar, eliminar los archivos temporales.

## Reglas de mantenimiento

- No aceptar archivos nuevos por encima de 500 líneas efectivas.
- No usar comentarios de relleno para bajar el conteo.
- No renombrar archivos para fingir que son generados.
- No agregar flags ad-hoc al hook para saltear la validación.
- Si un archivo excede 400 líneas efectivas, planear su refactor antes de que cruce 500.

## Historial de cambios

- 2026-06-27: Se agregó el umbral de advertencia a 400 y se eliminó toda la deuda Go por encima de 500. Ver commit `c8a7a3b`.
