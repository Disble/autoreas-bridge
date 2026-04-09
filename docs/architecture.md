# Autoreas Bridge — Documento de Arquitectura

**Fecha:** 2026-04-05
**Estado:** Activo (V2 Post-Simulación)

Este documento refleja las decisiones de diseño técnico fundamentales (apoyadas en el RFC original) que guían el desarrollo de Autoreas Bridge.

---

## 1. Patrón Arquitectónico Principal: Hexagonal (Ports & Adapters)

El sistema se divide en **Bounded Contexts (Dominios)** fuertemente separados. Ningún dominio conoce la infraestructura de red (HTTP/WS) ni la interfaz gráfica (Wails). Las dependencias apuntan siempre hacia el centro (el dominio).

### Dominios (Bounded Contexts)

1. **`internal/anime/` (Anime Domain):** 
   - **Responsabilidad:** Conocer el formato `animes.dat`, parsear NeDB, escribir cambios, validar la estructura y reglas de negocio de los animes.
   - **Mecanismo Lectura:** Usa un File Watcher con **Debouncer** (~50ms) y **Retry Loop** (Exponential Backoff). **Importante:** Observa el directorio `data/` y filtra eventos de `animes.dat` para evitar el "fsnotify detachment" (si NeDB hace un save atómico/compactación que reemplace el inodo del archivo, el watcher no se "cae").
   - **Mecanismo Escritura (Auto-DDoS Prevention):** Usa una estrategia **Append-Only** (agrega una nueva línea JSON con el mismo `_id` al final del archivo). Dado que Windows bloquea la apertura concurrente de un mismo archivo (`os.OpenFile`), el Bridge **usa un patrón de Cola de Escritura (Single-Threaded Worker Channel)**. Múltiples eventos del Bus (ej: 50 actualizaciones en un Reconcile masivo tras un mes offline de la Tablet) entran a un canal de Go (`chan AnimeUpdateRequestedEvent`), y un solo worker abre el archivo en modo secuencial o batch y los escribe ordenadamente, evitando que Go crashee con `The process cannot access the file`. Para evitar un "Self-Echo" (que el Watcher lea el evento asíncrono que nosotros mismos generamos al escribir), el escritor **guarda un hash del contenido inyectado en RAM**. Cuando el Watcher recibe un evento, parsea la línea y si su hash coincide con uno recién inyectado, la ignora silenciosamente. **Contrato de Propagación:** Dado que el Watcher ignora el Self-Echo, el Writer mismo DEBE emitir un evento `AnimeChangedEvent` de confirmación al Bus inmediatamente después de la escritura exitosa, garantizando que el dominio Sync y los clientes WS sean notificados del cambio local.
   - **Resiliencia del Parser y Diff por _id:** El motor que lee `animes.dat` nunca lee todo de golpe (por riesgo de OOM en archivos grandes) y nunca usa un `json.Unmarshal` masivo. Lee línea a línea, descartando la marca **UTF-8 BOM (`\xef\xbb\xbf`)** si aparece al inicio, tolerando líneas corruptas y con buffer explícito para no depender del límite por defecto de `bufio.Scanner`. La detección de cambios para snapshots retroactivos (catch-up) **no** debe basarse en el hash crudo de la línea, ya que NeDB acumula historial por `_id`. El motor debe procesar todas las líneas, consolidar el **estado efectivo final por `_id`**, y comparar el hash de ese estado final contra SQLite para disparar el Catch-Up.
   - **Compatibilidad de Schema Legacy (Raw vs Domain):** El modelo debe tolerar variaciones históricas del schema (por ejemplo `dia`/`orden` viejo versus `dias[]` nuevo), `$$date` y campos opcionales. En Go, la estructura cruda de NeDB (`LegacyAnimeRaw`) **debe usar punteros o `json.RawMessage`** para todos los campos opcionales/nulos (`fechaEstreno`, `fechaUltCapVisto`, `duracion`, etc.), evitando que los zero-values de Go (como `false` o `0`) sobreescriban propiedades ausentes o `null` en el archivo legacy. `nrocapvisto` debe tratarse como número **fraccional** (`0.5`, `1.5`, etc.), no como entero rígido.
   - **Borrado Lógico vs Tombstone (Tri-state):** En el legacy existen dos conceptos distintos. Un **anime inactivo** se marca con `activo=false` o, a menudo, con la **ausencia del campo `activo`**. El modelo de Go debe soportar este tri-state (true, false, nil) para no falsear el estado. Por otro lado, un **anime físicamente borrado** se marca con un Tombstone `{"$$deleted": true, "_id": "XYZ"}`. El Bridge DEBE preservarlos como estados diferentes: el inactivo sigue existiendo en el modelo; el tombstone elimina el `_id` del mapa de estado efectivo en RAM y bloquea PATCH posteriores (404) para evitar resurrección zombie.

2. **`internal/sync/` (Sync Domain):** 
   - **Responsabilidad:** Manejar el registro de cambios (Changelog en SQLite), detectar conflictos y resolverlos mediante **Reconciliación Semántica (CRDT-like)**.
   - **Mecanismo:** Desacoplado totalmente de `animes.dat`. Recibe los `AnimeChangedEvent` (incluso los retroactivos) y los anota en SQLite (`changelog`, `conflicts`). La base de datos del Bridge debe crearse obligatoriamente en `%APPDATA%\Autoreas\data\bridge.db` para evitar que el UAC (User Account Control) de Windows bloquee las escrituras si el usuario instala el binario en `C:\Program Files`. La conexión a SQLite debe configurarse con **Modo WAL (`PRAGMA journal_mode=WAL`) y Timeout (`busy_timeout=5000`)** de forma obligatoria; de lo contrario, las Go-Routines del Event Bus asíncrono causarán errores `database is locked (SQLITE_BUSY)` al insertar múltiples eventos a la vez. Para el progreso (`nrocapvisto`), siempre gana el mayor valor `MAX(local, remote)` sin importar el timestamp (evade "Stale Overwrites" de la app legacy con "Blind RAM"). Esa regla aplica sobre números fraccionales también.

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
- Los helpers exportados requieren JSDoc y las props en `*.types.ts` deben ser `readonly`.
- Cuando haga falta scaffolding de una feature nueva, debe usarse `bun --cwd="frontend" run generate:feature <feature> <ComponentName>` en vez de crear carpetas complejas manualmente.
