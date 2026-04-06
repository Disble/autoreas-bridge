# Plan de Tracer Bullets — Modelo en Árbol (Desarrollo Paralelo)

**Fecha:** 2026-04-05
**Estado:** Activo
**Objetivo:** Estructurar el desarrollo de Autoreas Bridge no como una secuencia lineal de fases, sino como un **árbol de dependencias** donde múltiples "Tracer Bullets" (balas trazadoras) pueden dispararse en paralelo por equipos o agentes independientes, uniéndose al final a través de contratos predefinidos.

---

## 🌳 El Tronco (Día Cero): Contratos y Event Bus

La única dependencia dura del proyecto. Antes de abrir cualquier rama, debemos definir el idioma común.

- **Event Bus:** Estructura en memoria (Pub/Sub).
- **Eventos:** `AnimeChangedEvent`, `SyncRequestedEvent`, etc.
- **Interfaces (Ports):** Contratos de lo que cada dominio expone (ej: `AnimeRepository`, `ChangelogStore`).
- **Cascarón (main.go):** Inyección de dependencias con implementaciones `Dummy` (que solo loguean).

*Una vez fusionado el Tronco, el desarrollo se divide en 4 ramas totalmente independientes.*

---

## 🌿 Rama 1: Dominio Anime (El motor de datos)
*No sabe nada de red, ni de Wails, ni de SQLite.*

- **Tracer 1.1 (Lectura):** File Watcher -> Parser NeDB -> Emite `AnimeChangedEvent` al Bus.
- **Tracer 1.2 (Escritura):** Recibe un `UpdateAnimeCommand` -> Estrategia Append-Only -> Escribe en `animes.dat` sin pisar la app legacy.
- **Validación:** Contra los archivos `.js` de `D:\dev\disble\automatizar-tareas\models`.

## 🌿 Rama 2: Dominio Sync (El cerebro de reconciliación)
*No sabe nada de NeDB ni de WebSockets. Pura lógica de estado.*

- **Tracer 2.1 (Changelog):** Escucha `AnimeChangedEvent` (mockeado) -> Guarda en SQLite.
- **Tracer 2.2 (Reconciliación):** Recibe un Changelog remoto simulado -> Ejecuta reconciliación semántica (`MAX` para `nrocapvisto`, incluso fraccional) -> Resuelve conflictos -> Guarda en SQLite `conflicts`.

## 🌿 Rama 3: Dominio Device & Red (La comunicación)
*No sabe nada de animes ni de cómo se guardan. Solo transporta bytes.*

- **Tracer 3.1 (REST API):** Levanta servidor HTTP -> Expone endpoints con JSONs mockeados -> Valida JWT/Bearer.
- **Tracer 3.2 (WebSocket):** Escucha `AnimeChangedEvent` (mockeado) -> Transmite JSON por WS a clientes conectados.
- **Tracer 3.3 (Descubrimiento):** Registra servicio mDNS -> Genera token de pairing.

## 🌿 Rama 4: Dominio System & UI (El empaquetado)
*No sabe de red ni de bases de datos. Es puramente presentacional y de SO.*

- **Tracer 4.1 (Wails Bindings):** Conecta métodos de React con funciones Go mockeadas (ej: `GetSyncStatus() -> "OK"`).
- **Tracer 4.2 (OS Integration):** System Tray, Auto-start en el registro de Windows, minimizar al reloj.

---

## 🤝 La Copa del Árbol (Integración Final)

Como cada rama se desarrolló usando el mismo **Tronco** (el Event Bus y las Interfaces), la integración final no requiere reescribir código. 

Se reemplazan los `Dummies` en `main.go` por las implementaciones reales de cada rama.
El flujo `File Watcher -> Event Bus -> SQLite -> WebSocket -> UI` cobra vida instantáneamente.
