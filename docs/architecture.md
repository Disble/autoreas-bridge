# Autoreas Bridge — Documento de Arquitectura

**Fecha de creación:** 2026-04-05
**Última revisión sustantiva:** 2026-08-25
**Estado:** Activo y mantenido. Este documento no es un registro histórico: se actualiza cuando el código cambia (las secciones 5-6 se mantuvieron durante agosto de 2026), y ante cualquier discrepancia el código gana como verdad de runtime.

Este documento refleja las decisiones de diseño técnico fundamentales (apoyadas en el RFC original) que guían el desarrollo de Autoreas Bridge.

---

## 1. Patrón Arquitectónico Principal: Hexagonal (Ports & Adapters)

El sistema se divide en **Bounded Contexts (Dominios)** fuertemente separados. Ningún dominio conoce la infraestructura de red (HTTP/WS) ni la interfaz gráfica (Wails). Las dependencias apuntan siempre hacia el centro (el dominio).

### Dominios (Bounded Contexts)

1. **`internal/anime/` (Anime Domain):**
   - **Responsabilidad:** Es el dueño exclusivo del estado de animes: valida las reglas de negocio (progreso, estado, días de emisión, repeticiones, portadas), decodifica y re-codifica el formato de almacenamiento propio del Bridge, y orquesta cada escritura contra SQLite. Desde **SDD-55 no existe ningún canal de archivo con la app Legacy**: se eliminaron el file watcher de `animes.dat`, el parser NeDB, el writer append-only, el catch-up de arranque y la arbitración de propiedad. La decisión está registrada en `docs/adr/008-legacy-breakup-sqlite-sole-owner.md` (Accepted), y el test de regresión `app_no_legacy_channel_test.go` prueba que el arranque no resuelve, abre ni espera ningún archivo Legacy: una base vacía sirve un catálogo vacío, sin ruta de import.
   - **Mecanismo Lectura:** `store.Gateway` (`internal/anime/store/gateway.go`) carga snapshots desde la tabla `anime_snapshots` de SQLite (`Get`/`List`), decodifica el `snapshot_json` a `AnimeRaw`, lo proyecta al modelo de dominio con `Mapper.ToDomain` y recalcula el hash canónico. No hay lectura de archivos, ni escaneo línea por línea, ni tolerancia a líneas corruptas: la fuente es una fila de base de datos, no un log append-only donde NeDB acumulaba historial por `_id`.
   - **Mecanismo Escritura (Stage → Finalize → Publish):** Cada escritura pasa por `persist()` (`internal/anime/store/gateway_write_helpers.go`): se registra una `WriteOperation` durable con el estado base y el deseado (`Stage`), se hace el upsert en `anime_snapshots` (`Finalize`), y recién entonces se drena el outbox (`DrainOutbox`), que publica el `anime.changed` ya comprometido. Una operación que quedó en `staged` tras un crash se reintenta en el arranque siguiente (`Recover`, `internal/anime/store/recovery.go`), y la entrega del outbox es **at-least-once** porque la fila se marca publicada después del publish en memoria. `UpdateWriter` (`internal/anime/writer.go`) conserva la cola serializada de un solo worker, pero ya **no escribe a ningún archivo** (no hay writer de `animes.dat` ni seam `AppendLine`): su trabajo restante es publicar el evento comprometido. La concurrencia se controla con OCC (`Base` contra `ModifiedAt`), no con locks de archivo ni con un guard de self-echo.
   - **Formato de almacenamiento retenido (`internal/anime/store`):** El codec conserva la *forma* histórica del documento NeDB (un objeto JSON plano por anime, con `days[]`, `repetitions[]`, `cover{}`), pero es el formato de almacenamiento **propio** del Bridge dentro de `anime_snapshots.snapshot_json`: byte-compat con las filas ya persistidas, no un canal hacia ninguna app externa. SDD-56 hizo el corte duro de vocabulario: las claves almacenadas hoy son inglesas (`id`, `name`, `episodesWatched`, `status`, `active`, `days`, `premieredAt`, …) y las fechas son epoch-millis planos. El mapa de renombre y el desenvuelto de `{"$$date": n}` viven en la migración one-shot `internal/sync/vocabulary_migration.go`, que corre una sola vez en el bootstrap y no es alcanzable desde ningún path vivo de REST/WS/sync. Las claves desconocidas se preservan opacas y byte-a-byte.
   - **Opcionalidad y tolerancia de schema (`AnimeRaw`):** `AnimeRaw` (`internal/anime/store/wire.go`) es un envelope sin pérdida: solo `id`, `name` y `episodesWatched` son campos tipados, y todo lo demás vive en `extraFields map[string]json.RawMessage`, con setters de **puntero** (`SetStringField(*string)`, `SetFloatField(*float64)`, `SetDateField(*time.Time)`) para que los zero-values de Go (`false`, `0`, `""`) nunca sobreescriban un campo ausente ni un `null` explícito. El modelo sigue tolerando variaciones históricas del schema: `days()` cae a los campos planos `day`/`order` cuando no hay `days[]`. `episodesWatched` se trata como número **fraccional** (`0.5`, `1.5`, etc.), no como entero rígido: se persiste como `float64` y el dominio acepta pasos de `±1` y `±0.5` (`internal/anime/episode_service.go`).
   - **Inactivo vs Borrado Lógico (Tri-state):** Un anime inactivo se marca con `active=false` o, a menudo, con la **ausencia del campo**, y el dominio preserva ese tri-state (`domain.TriStateTrue` / `TriStateFalse` / `TriStateAbsent`) para no falsear el estado. El tombstone `{"$$deleted": true, "_id": "XYZ"}` de NeDB **ya no existe**: el borrado es lógico y se reconoce por la combinación de `active == false` **y** `deletedAt != nil` (`store.IsSoftDeleted`, `internal/anime/store/projection.go`). La fila nunca se elimina de `anime_snapshots`, así que el registro sigue siendo legible y restaurable en vez de desaparecer del estado efectivo.

2. **`internal/sync/` (Sync Domain):** 
   - **Responsabilidad:** Manejar el registro de cambios (Changelog en SQLite) y **detectar conflictos mediante Concurrencia Optimista (OCC)** para resolución del usuario (SDD-30).
   - **Mecanismo:** Desacoplado totalmente de `animes.dat`. Recibe los `AnimeChangedEvent` (incluso los retroactivos) y los anota en SQLite (`changelog`, `conflicts`). La base de datos del Bridge debe crearse obligatoriamente en `%APPDATA%\Autoreas\data\bridge.db` para evitar que el UAC (User Account Control) de Windows bloquee las escrituras si el usuario instala el binario en `C:\Program Files`. La conexión a SQLite debe configurarse con **Modo WAL (`PRAGMA journal_mode=WAL`) y Timeout (`busy_timeout=5000`)** de forma obligatoria; de lo contrario, las Go-Routines del Event Bus asíncrono causarán errores `database is locked (SQLITE_BUSY)` al insertar múltiples eventos a la vez. La detección de conflictos usa **Concurrencia Optimista (OCC)**: el Bridge mantiene un token de versión monótono `modified_at` por anime y el cliente lo reenvía como `base`. Si `base` coincide con el actual, la escritura se aplica (un capítulo **puede bajar** — corrección legítima); si difiere (edición concurrente), el Bridge registra un **conflicto no-bloqueante** preservando ambas versiones (`local_snapshot_json`/`remote_snapshot_json`) y notifica, sin pisar ni bloquear al cliente. La resolución es del usuario (modelo git/Syncthing). La vieja regla CRDT-`MAX(local, remote)` fue **descartada y removida** (SDD-30: un capítulo puede bajar, así que MAX era incorrecto; además nunca se cableó en producción).

3. **`internal/device/` (Device/Auth Domain):**
   - **Responsabilidad:** Gestionar el emparejamiento (Tokens de Pairing), la exposición de dirección de conexión (**IP/puerto + QR**), la lista de dispositivos de confianza y las conexiones en tiempo real (WebSockets).
   - **Mecanismo:** Persiste dispositivos en SQLite. La estrategia principal de conexión para mobile pasa a ser IP local explícita + QR/Token. mDNS queda despriorizado como capacidad opcional/best-effort futura: si alguna vez se habilita, jamás debe ser prerequisite ni punto único de falla para el flujo principal.

4. **`internal/system/` (System Domain):**
   - **Responsabilidad:** Arrancar la app, registrar Auto-start en el OS, gestionar el System Tray y encapsular Wails.

---

## 2. Comunicación Inter-Dominio: Event Bus en Memoria

Para evitar el acoplamiento cruzado, el sistema usa un **Event Bus basado en Go channels**. 

- **Publisher:** `AnimeService` detecta un cambio (o un delta en el catch-up de arranque) y emite un `AnimeChangedEvent` (Fat Event: incluye el JSON del anime entero).
- **Subscribers:** 
  - `SyncService` escucha y guarda en su Changelog (SQLite).
  - `DeviceService` escucha y lo emite a las tablets conectadas por WebSocket.

---

## 3. Asimetría de Sincronización y Validación

El PC (Autoreas Desktop) es el Master absoluto de la lista. La Tablet es un dispositivo satélite asimétrico.

1. **El PC puede:** Crear, Actualizar y Eliminar animes (vía la app nativa). El Bridge detecta esto y lo envía al Bus.
3. **La Tablet SOLO puede:** Actualizar (`PATCH` a ciertos campos permitidos como estado, progreso, fechas). No puede enviar `POST` ni `DELETE` de animes.
4. **Inmunidad al Clock Skew (Server-Side Timestamping):** Si la hora de la Tablet está mal, un LWW (Last-Write-Wins) con el timestamp de la Tablet generaría victorias injustas. El Bridge asigna la Fecha de Modificación y la Fecha de Último Capítulo Visto con `time.Now().UnixMilli()` (Reloj del Servidor Windows) al recibir la Request HTTP. El Servidor es el único Oráculo del tiempo.
5. **Máquina de Estado Cruzada (Cross-Field Business Logic):** El Bridge NO debe actuar como un "dumb pipe" ciego a las reglas del Legacy. En Autoreas Desktop, si un anime tiene `totalcap: 12`, al marcar el capítulo 12 la app automáticamente marca el estado como `1` (**Finalizado**). Si la Tablet envía `PATCH {nrocapvisto: 12}` sin cambiar el estado, el Bridge insertaría un JSON ilegítimo (`12/12, estado: 0 [Viendo]`) y corrompería la UI y los filtros del Legacy ("Paradoja de Estado"). El Controller del Backend DEBE revisar la memoria RAM, comparar `nrocapvisto == totalcap` y, si se cumple, forzar silenciosamente `estado = 1` antes de inyectar el JSON.

Usamos 3 capas de validación para las actualizaciones:
1. **Validación de Transporte (Adapters - HTTP/WS):** Rechaza campos desconocidos (Strict Shape).
2. **Validación de Dominio (Application / Value Objects):** Reglas de negocio (ej: `estado` en [0,1,2,3], `nrocapvisto` numérico y `>= 0`, admitiendo medios capítulos).
3. **Validación de Interoperabilidad (Legacy Compatibility):** El parser (Custom Unmarshaler) lidia con `{"$$date": ms}` y evita que Go corrompa el archivo llenándolo de defaults (ej: omite `omitempty` cuando el legacy exige un `null` explícito).

---

## 4. Estrategia de Documentación Reactiva

La documentación del proyecto no es estática, es viva:

- **RFC:** Visión y objetivos de alto nivel.
- **Documento de Arquitectura:** (Este documento) Reglas de diseño y topología post-simulación.
- **SDD Tree:** Plan maestro de Specs y Tasks accionables y granulares para agentes workers.
- **Living Specs:** Notas empíricas descubiertas fase a fase en `/docs/adr/`.

---

## 5. Frontend React/Wails — Rails de Arquitectura

El frontend de Wails también queda sujeto a rails arquitectónicos estrictos:

- `frontend/src/App.tsx` y cualquier futuro `frontend/src/app/**` son capa de entrega/composición solamente.
- Los módulos complejos de UI deben vivir bajo `frontend/src/features/` con colocation estricta (`index.ts`, `.tsx`, `use-*.ts`, `*.helpers.ts`, `*.types.ts`, `*.constants.ts`, opcional `*.schema.ts`, y `__tests__/`).
- Los `.tsx` de `frontend/src/features/` son **dumb UI**: HeroUI React + Tailwind, sin Wails bindings, sin `useEffect`, sin lógica de negocio.
- Los hooks (`use-*.ts`) concentran orquestación, efectos y acceso a bindings Wails siguiendo la anatomía estricta definida en `AGENTS.md`.
- Las pantallas que renderizan estado de runtime compartido usan read-models de Zustand en `frontend/src/shared/store/`. Los Wails bindings siguen encapsulados en carpetas de infraestructura bajo `frontend/src/infrastructure/<adapter>/`, importadas por ruta concreta a sus role files: no hay `index.ts` de entrada desde que ADR-011 eliminó los barriles en julio de 2026. El store centraliza snapshots, selección e invalidación por eventos. Downloads usa `download-runtime-store` para que Schedule y Run History reaccionen al mismo flujo `download.run_started` / `download.run_progress` / `download.run_finished` sin duplicar suscripciones ni reglas de refresco por panel.
- Toda declaración pública exportada desde `frontend/src/**/*.{ts,tsx}` requiere JSDoc por defecto, incluyendo `src/App.tsx`, `src/app/**`, hooks, helpers, adapters de infraestructura folder-owned, stores, constants, schemas y contratos. La única excepción permitida es un barrel puro `index.ts` que solo reexporta símbolos desde módulos ya documentados y no define implementación local.
- Los módulos folder-owned exponen su superficie pública solo mediante un `index.ts` puro. No compatibility shims or production allowlist entries remain for the migrated infrastructure adapters.
- Los helpers exportados requieren JSDoc y las props en `*.types.ts` deben ser `readonly`.
- Cuando haga falta scaffolding de una feature nueva, debe usarse `bun --cwd="frontend" run generate:feature <feature> <ComponentName>` en vez de crear carpetas complejas manualmente.
- Los fixtures de lint deliberadamente inválidos siguen fuera del lint normal: existen para modelar inputs prohibidos con precisión y su harness dedicado valida que la regla muerda sin contaminar el árbol productivo.

### Fallow como capa de análisis estático del frontend

- El repo usa **Fallow** dentro de `frontend/` para detectar dead code, problemas de dependencias, duplicación y riesgo de cambios.
- La puerta de entrada operativa es `bun --cwd="frontend" run fallow audit --quiet`, ejecutada desde `lefthook.yml`.
- La configuración viva está en `frontend/.fallowrc.json`.
- `wailsjs/**` se ignora porque es código generado del bridge/runtime.
- Desde 2026-08-23 `frontend/wailsjs/` además **no se versiona**: Wails lo regenera en cada build y borra el directorio de runtime entero, así que nunca fue fuente editable. Quince archivos del frontend importan de ahí y el gate hace typecheck sin invocar a Wails, por eso el hook `postinstall` de `frontend` lo regenera; usar `bun --cwd="frontend" run generate:bindings` después de cambiar un método bindeado. El motivo del cambio está en `docs/reports/dharness-generated-code-exclusion.md`.
- `src/test/setup.ts` se declara manualmente como entry point para evitar falsos positivos sobre el setup de Vitest.
- El detalle operativo y de triage queda documentado en `docs/fallow-usage.md`.

---

## 6. Política Transversal de Tamaño de Archivo

- Go and frontend source files follow a shared warning threshold at 400 effective lines and a hard ceiling above 500 effective lines.
- El conteo efectivo excluye líneas en blanco y líneas de comentario puro para que la regla mida complejidad real y no ruido de formato.
- `lefthook.yml` ejecuta `bun --cwd="frontend" run filesize:warning` como ruta de visibilidad temprana para TS/TSX sin debilitar el error existente de ESLint al superar 500 líneas efectivas.
- `lefthook.yml` ejecuta `go run ./tools/checkgofilesize` como validador determinístico propio del repositorio antes de `golangci-lint`.
- `tools/checkgofilesize/baseline.yaml` carries temporary no-growth ceilings for legacy Go debt.
- `tools/checkgofilesize/baseline.yaml` debe permanecer vacío (`files: []`). Cualquier entrada existente es una excepción activa que debe eliminarse en cuanto el archivo llegue a `<=500` líneas efectivas.
- Un archivo Go nuevo, renombrado o ya reducido a `<=500` líneas efectivas no puede recibir entrada de baseline.
- Cuando un archivo con deuda baja de tamaño, el mismo PR debe bajar su techo en baseline. Cuando llega a `<=500`, la entrada se elimina.
- La meta final es cero deuda permanente por encima de 500 líneas efectivas.
- Los comentarios de relleno, renombrados para fingir código generado y flags ad-hoc para saltear el hook están prohibidos.
- Para los detalles de implementación, ver `docs/file-size-policy.md`.
