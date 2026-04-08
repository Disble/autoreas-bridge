# SDD Master Tree — Refinado Post-Simulación v2 (Amnesia & Asimetría)

**Fecha:** 2026-04-05
**Objetivo:** Plan maestro de especificaciones para agentes workers. Refinado tras detectar "El Agujero de Amnesia del Bridge Offline" (Snapshots en SQLite), confirmar la "Sincronización Asimétrica" (Tablet = Solo PATCH) y corregir compatibilidad real con el modelo legacy.

**Orden recomendado de implementación temprana:** `SDD-00 -> SDD-02 -> bootstrap parcial de SDD-06 -> SDD-03 -> SDD-01 -> SDD-04 -> SDD-05 -> SDD-07 -> SDD-08`.

---

## 🏗️ FASE 0: Tracer Bullet y Tooling (El Cimiento)

### SDD-00: Tooling, Linters y Decisiones de Build
- **Spec:** Configurar `golangci-lint` en el repo. Elegir driver SQLite **Pure Go** (ej. `modernc.org/sqlite` o `glebarez/go-sqlite`) para evitar CGO. Definir `internal/events/bus.go` (El Event Bus).
- **Criterio de Éxito:** `golangci-lint run` pasa en verde. `go build` compila sin requerir GCC en Windows.

### SDD-01: Tracer Bullet Inicial (Wiring)
- **Spec:** Crear `main.go` instanciando los 4 dominios con structs vacíos (Dummies). Conectarlos al EventBus.
- **Criterio de Éxito:** Al ejecutar, la consola imprime un log simulado viajando desde el Dummy AnimeService hasta el Dummy WebSocket, pasando por el Bus.

---

## 📂 FASE 1: Dominio Anime (La pesadilla de NeDB y el PC Offline)

### SDD-02A: Modelo Raw Legacy y Matriz de Opcionales
- **Spec:** Crear `internal/anime/domain/anime.go` y `anime_raw.go`. El modelo crudo `LegacyAnimeRaw` debe usar punteros o `json.RawMessage` para todos los campos opcionales/nulos (`fechaEstreno`, `fechaUltCapVisto`, `duracion`, `tipo`, `pagina`, `carpeta`, `estudios`, `generos`) y para el flag `activo` (que en NeDB es tri-state: true, false, ausente). Implementar la interfaz `json.Unmarshaler` custom para extraer el timestamp de `$$date` a un `time.Time` nativo de Go. El modelo debe ser tolerante al schema legacy real: `nrocapvisto` puede ser fraccional y deben contemplarse variantes históricas (`dia`/`orden` viejo versus `dias[]` nuevo).
- **Criterio de Éxito:** Test unitario que tome un string crudo con `$$date`, progreso `0.5`, campo `activo` ausente y variantes de schema legacy, y lo convierta a un struct Go válido sin perder datos al reserializar (Marshal).

### SDD-02.5: Bootstrap SQLite mínimo (Dependencia del Snapshot)
- **Spec:** Antes de implementar snapshots, inicializar la ruta UAC-safe de SQLite, abrir la conexión con driver Pure-Go, aplicar WAL + `busy_timeout` y crear al menos la tabla `anime_snapshots`. Esto existe para evitar que SDD-03 dependa de infraestructura todavía inexistente.
- **Criterio de Éxito:** El proceso puede arrancar, abrir SQLite en `%APPDATA%\Autoreas\data\bridge.db` y crear `anime_snapshots` sin requerir CGO.

### SDD-03: Snapshot Persistente y NeDB Parser (Anti-Amnesia, Resiliencia UTF-8, Archivo Fantasma y Tombstones)
- **Spec:** Al arrancar el bridge, debe validar que `animes.dat` exista. Si **no existe (Archivo Fantasma)**, no paniquear; debe iniciar un ciclo de "Idle Polling" cada 5 segundos hasta que Autoreas Desktop lo cree. Si existe, interactuar con la tabla local SQLite `anime_snapshots` ya creada en SDD-02.5. La detección de cambios para Catch-Up **no** debe hacerse comparando hashes crudos por línea individual (debido a que NeDB es append-only). El Parser debe consolidar todo el archivo, calcular el **estado efectivo por `_id`**, y recién comparar el hash del struct consolidado contra SQLite. Cualquier discrepancia dispara un evento retroactivo.
- **Resiliencia de Parser:** **No** usar `ioutil.ReadFile` ni `json.Unmarshal([]byte)`. Leer línea a línea con buffer explícito suficiente para evitar límites por defecto de scanner. Descartar **obligatoriamente** el prefijo UTF-8 BOM (`\xef\xbb\xbf`) de la primera línea si existe. Si una línea da error de JSON o está corrupta, loguear Warning y continuar con la siguiente, NUNCA paniquear el proceso. Además, **procesar Tombstones explícitamente (`$$deleted: true`)**: Si una línea borra físicamente un anime, el Parser debe purgar ese `_id` del mapa de estado efectivo en memoria. Si una línea marca `activo=false`, NO debe tratarla como tombstone: el anime sigue existiendo, solo está inactivo.
- **Criterio de Éxito:** Arrancar el Bridge sin la carpeta `data` existente debe mantenerse corriendo y loguear "Esperando datos". Un archivo con BOM o JSON roto en la línea 300 sigue parseando las restantes 500 y devolviendo los animes sanos. El JSON con `$$deleted` elimina el objeto del Hash Map devuelto; un anime con `activo=false` permanece accesible en memoria como registro inactivo.

### SDD-04: Windows-Resilient File Watcher (Directorio, NO Archivo)
- **Spec:** Inicializar *después* de que `animes.dat` exista. **NO debe observar el archivo directamente con `fsnotify.Watch(animes.dat)`**. Debe observar el directorio padre (`.../data`) y filtrar eventos por nombre `animes.dat`. Esto es crítico porque si el usuario o NeDB hacen un guardado atómico o compactación (Rename/Remove + Create), el watcher de archivo directo perdería el inodo y quedaría sordo y *detached* silenciosamente. Necesita Debouncer y Retry Loop.
- **Criterio de Éxito:** Si el test de integración renombra `animes.dat` a `.tmp` y crea un `animes.dat` nuevo, el watcher lo detecta y sigue escuchando futuros cambios (no crashea ni queda *detached*).

### SDD-05: Append-Only Safe Writer (Single-Threaded Cola y Deduplicación)
- **Spec:** Recibe actualizaciones validadas del Dominio y del Motor Sync (`AnimeUpdateRequestedEvent`). **Auto-DDoS Prevention:** Si 50 eventos llegan de golpe, abrir concurrentemente `animes.dat` fallará (`The process cannot access the file`). El Writer debe usar una **Cola de Escritura en Go (Channel Worker)** de 1 solo worker eterno que lea el canal, abra el archivo y escriba, cerrándolo secuencial y determinísticamente. Para evitar un "Self-Echo" (que el Watcher SDD-04 lea la propia línea que inyectamos), el escritor calcula el MD5 del JSON inyectado, y lo registra en un mapa `[]HashesEnviados` (Deduplication Map) compartido. El Watcher leerá el evento asíncrono, calculará el Hash, lo encontrará y lo descartará silenciosamente. **Contrato de Propagación:** Inmediatamente después de escribir con éxito, el Writer mismo emite un `AnimeChangedEvent` al Bus para informar al ecosistema (Sync, WS) del nuevo estado, ya que el Watcher omitirá ese paso.
- **Criterio de Éxito:** Un test de estrés con 50 eventos `AnimeUpdateRequestedEvent` concurrentes insertados al Bus verifica que solo un OS File Open ocurrió a la vez, escribiendo 50 líneas. El Writer emite los 50 eventos confirmados, y el Watcher SDD-04 procesa y filtra el file system notification como Self-Echo sin duplicarlos.

---

## 🧠 FASE 2: Dominio Sync (Estado y Conflictos)

### SDD-06: Repositorios SQLite (Pure-Go, WAL y Ruta UAC-Safe)
- **Spec:** Expandir el bootstrap de SQLite ya iniciado en SDD-02.5. Inicializar la BD en una ruta compatible con el User Account Control (UAC) de Windows. Si el binario compilado de Wails reside en `C:\Program Files`, intentar abrir `./bridge.db` generará un "Access is Denied" oculto y el programa colapsará en background. La DB debe forzarse en `os.UserConfigDir()` -> `AppData\Roaming\Autoreas\data\bridge.db`. Usar driver Pure-Go y ejecutar queries `CREATE TABLE` en startup. **Conexión:** La cadena de conexión en `database/sql` **debe habilitar el modo Write-Ahead Logging (`PRAGMA journal_mode=WAL;`) y `PRAGMA busy_timeout=5000;`**; de otra forma, un Event Bus asíncrono que inserta muchos Changelogs en simultáneo tirará el error de Concurrency `SQLITE_BUSY (database is locked)` y perderá datos de sync.
- **Criterio de Éxito:** Un test de estrés lanzando 100 `InsertChangelog` concurrentemente en goroutines diferentes NO produce ningún error `database is locked`.

### SDD-07: Changelog Recorder
- **Spec:** Suscribirse al `EventBus`. Cada vez que llega un `AnimeChangedEvent` (ya sea por Watcher en tiempo real o por Catch-Up en el arranque del SDD-03), persistirlo en la tabla `changelog` marcándolo como `pending` para los dispositivos.
- **Criterio de Éxito:** Emitir evento simulado en el Bus -> verificar inserción en SQLite.

### SDD-08: Motor Lógico de Reconciliación (Semántico CRDT-like)
- **Spec:** Función pura. Recibe Changelog Local y Changelog Remoto. Regla de **Reconciliación Semántica**: El progreso de un anime (`nrocapvisto`) nunca retrocede. Usa la regla `MAX(local.nrocapvisto, remote.nrocapvisto)`, ignorando el timestamp de LWW (para evadir "Stale Overwrites" si la app legacy escribe desde una memoria "vieja" porque estaba abierta). Debe soportar progreso fraccional (`0.5`). Si el Remoto gana, emite un evento `AnimeUpdateRequestedEvent` para que el Dominio Anime escriba.
- **Criterio de Éxito:** 100% test coverage con matrices de estado cruzado, incluyendo casos con `0.5`, demostrando que una escritura *stale* local no borra progreso remoto mayor aunque el local tenga timestamp más reciente. Cero dependencias de BD o Red.

---

## 📡 FASE 3: Red y Dispositivos (API Restringida)

### SDD-09: REST API, Middlewares y Autenticación
- **Spec:** Router HTTP. Endpoint `POST /api/devices/pair`. Middleware de Token. **Bloquear estrictamente `POST` y `DELETE`** en el endpoint de animes (Sincronización Asimétrica). Solo permitir `PATCH /api/animes/:id`.
- **Criterio de Éxito:** Petición HTTP sin token devuelve 401. `POST /api/animes` devuelve 405 Method Not Allowed.

### SDD-10: REST API (Write, Sync, Anti-Zombies & Máquina de Estado Cruzada)
- **Spec:** Implementar `PATCH /api/animes/:id`. Validar (`estado` 0,1,2,3, `nrocapvisto` >= 0) y despachar el comando al dominio Anime. **IMPORTANTE 1: Bloquear Resurrección Zombie.** Antes de despachar, la API debe validar que el `_id` exista y no esté marcado como "borrado" (Tombstone `$$deleted`). Un anime inactivo (`activo=false`) NO es un tombstone: sigue existiendo. **IMPORTANTE 2: Bloquear Clock Skew de Android.** La Tablet *nunca* envía el timestamp de modificación o progreso. El Handler de Go asume ownership del server y estampa `time.Now().UnixMilli()` (Solo hay un reloj oficial). **IMPORTANTE 3: Paradoja de Estado (Cross-Field logic).** Si la Tablet envía un `PATCH` donde `nrocapvisto >= totalcap` (overrun o igualdad) y el Anime tiene un `totalcap` numérico mayor a cero en la base, el Bridge DEBE inyectar y mutar forzosamente el payload añadiendo `estado = 1` (**Finalizado**) para no inyectar un estado ilegítimo (12/12 pero en "Viendo") que corrompa la aplicación de UI de Electron legacy en sus filtros de visualización. Debe aceptar `nrocapvisto` fraccional (`0.5`) y `dias` dinámicos (evitar hardcodear los nombres de días). Implementar `POST /api/sync/reconcile` (Catch-Up obligatorio post-conexión de SDD-11).
- **Criterio de Éxito:** Si llega un Mock Tablet mandando un JSON `{"nrocapvisto": 12}` a un anime de `totalcap: 12`, el Handler intercepta y muta al Backend un Struct de Mutación donde se envía `estado: 1`. Un JSON `{"nrocapvisto": 10.5}` es aceptado si cumple validaciones. Relojes de 2030 Tablet son silenciados y descartados para el uso de Timestamp Server-Side de Go.

### SDD-11: WebSocket Hub y Re-Sync Obligatorio (Micro-Desconexiones)
- **Spec:** Priorizar descubrimiento explícito por **IP Local + QR/Token** para pairing y conexión desde mobile. Broadcastear eventos a los WS conectados. **Obligación del cliente:** Por protocolo, cuando el WS conecta (sea primera vez o re-conexión de 5 segundos), el Bridge asume que el cliente tiene "Gap" (eventos perdidos) e informa al cliente que DEBE disparar un `POST /api/sync/reconcile` REST inmediato antes de confiar en los eventos nuevos. **mDNS deja de ser parte crítica del slice** y pasa a quedar despriorizado como mejora best-effort/futura; si existe exploración técnica, debe ser opcional y jamás bloquear la conexión principal basada en IP/QR.
- **Criterio de Éxito:** El bridge expone la IP/puerto efectivo para pairing por QR o ingreso manual, el websocket reconecta correctamente tras ser cortado y el cliente recibe la instrucción de re-sync obligatorio al reconectar. La ausencia de mDNS NO bloquea el flujo principal.

---

## 🖥️ FASE 4: Wails y Empaquetado

### SDD-12: Wails Bindings & Lifecycle
- **Spec:** Configurar Wails en `main.go` con `HideWindowOnClose: true`. Mapear los métodos de `SyncService` a Wails Bindings para React.
- **Criterio de Éxito:** Cerrar la ventana no mata el proceso principal de Go.

### SDD-13: Integración OS (System Tray)
- **Spec:** Implementar el ícono en el área de notificación (Tray) con menú contextual "Abrir", "Salir".
- **Criterio de Éxito:** El binario inicia oculto/en el tray y responde a los clics.

### SDD-14: Frontend MVP (React)
- **Spec:** Bloquear las versiones en `package.json`. Configurar ESLint. Armar componentes de UI consumiendo la API de `window.go.*`. La pantalla de emparejamiento debe mostrar explícitamente la **IP Local Cruda (ej. 192.168.1.5)** junto al **QR/Token** como mecanismo principal de conexión para mobile. mDNS, si existiera más adelante, será complementario y no requisito de uso.
- **Criterio de Éxito:** La UI compila limpia, muestra el estado interno de SQLite y la IP cruda de red al abrir la ventana.
