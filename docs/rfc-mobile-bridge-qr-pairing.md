# RFC: Pairing QR entre Autoreas Mobile y Autoreas Bridge

**Autor:** OpenCode / GPT-5.4  
**Fecha:** 2026-04-13  
**Estado:** Aprobado para implementación bridge-side  
**Ámbito:** `autoreas-mobile` + `autoreas-bridge`

---

## 1. Resumen ejecutivo

Se propone implementar **pairing por QR end-to-end** entre mobile y bridge.

Hoy el bridge **sí genera QR**, pero ese QR codifica solo `http://{ip}:{port}` y **no alcanza para completar el pairing** sin ingreso manual del token. Mobile, por su parte, **no tiene lector de QR** y su soporte actual es únicamente un formulario manual con `ip`, `port` y `token`, más un parser parcial de deep links.

La decisión de este RFC es:

1. **Definir un contrato QR versionado** que incluya `ip`, `port` y `pairing_token`.
2. **Implementar scanner QR en mobile** para consumir ese contrato.
3. **Mantener fallback manual** por IP/puerto/token.
4. **Alinear la semántica de autenticación** con la verdad actual del runtime:
   - `pairing_token`: token de un solo uso para el alta del dispositivo.
   - `auth_token`: token persistente para requests posteriores.
5. **Eliminar la PoC previa de QR** que codifica solo `http://{ip}:{port}` y reemplazarla por el contrato final.

---

## 2. Problema

La feature pedida es “connect entre mobile y bridge por QR”. El problema real NO es solo “falta escanear QR”. El problema es de **contrato entre apps**.

Estado verificado en código:

- **Bridge** genera QR con payload `http://{ip}:{port}`:
  - `autoreas-bridge/frontend/src/features/dashboard/ui/PairingPanel/pairing-panel.helpers.ts`
- **Bridge** genera además un `pairing_token` separado y copyable:
  - `autoreas-bridge/app.go`
  - `autoreas-bridge/internal/device/service.go`
  - `autoreas-bridge/internal/api/router.go`
- **Mobile** espera pairing manual vía `POST /api/devices/pair` con body:
  - `{ pairing_token, device_name }`
  - `autoreas-mobile/src/features/setup/use-pair-device.ts`
- **Mobile** persiste luego `ip`, `port`, `auth_token`, `device_id` en SQLite:
  - `autoreas-mobile/src/infrastructure/db/schema.ts`
  - `autoreas-mobile/src/features/setup/use-pair-device.ts`
- **Mobile no tiene lector QR hoy**:
  - no hay dependencia de scanner/cámara en `autoreas-mobile/package.json`

Conclusión: el bridge y mobile están **parcialmente alineados** en el endpoint de pairing, pero **desalineados** en el contrato de QR y en la documentación.

---

## 3. Hallazgos del explore

### 3.1 Verdad actual de Mobile

- El setup actual es un formulario manual de `IP`, `Puerto` y `Token`.
- El submit hace `POST http://{ip}:{port}/api/devices/pair`.
- Si el bridge responde `device_id` + `auth_token`, mobile guarda la config y ejecuta `initialSync()`.
- Existe parsing de deep link, pero hoy:
  - espera `autoreas://pair?...`
  - mientras `app.json` declara el scheme `autoreas-mobile`
- No existe UI de cámara, permisos ni scanner.

### 3.2 Verdad actual de Bridge

- El panel de pairing muestra:
  - IP/puerto
  - QR
  - token copyable
- El QR actual codifica solo `http://{ip}:{port}`.
- `GetPairingToken()` genera un token nuevo al montar la pantalla/panel.
- `POST /api/devices/pair` consume un `pairing_token` de un solo uso y devuelve un `auth_token` persistente.

### 3.3 Drift relevante docs vs runtime

1. **Docs antiguos describen un token permanente único**, pero el runtime real usa:
   - token de pairing de un solo uso
   - token persistente de autenticación
2. **Docs de mobile hablan de QR scan**, pero el runtime no lo implementa.
3. **Deep link scheme desalineado**:
   - docs/parser: `autoreas://pair`
   - config real de Expo: `autoreas-mobile`
4. **QR actual no permite pairing completo**, solo descubrimiento parcial de dirección.

---

## 4. Objetivos

- Permitir pairing completo entre mobile y bridge mediante QR, sin escribir IP/puerto/token manualmente en el happy path.
- Mantener el flujo manual como fallback.
- Formalizar un contrato común entre ambas apps.
- Reducir drift entre docs y runtime.

### No objetivos

- No resolver descubrimiento automático por mDNS.
- No rediseñar el sistema completo de auth.
- No introducir cloud, cuentas ni internet.
- No reemplazar el flujo manual existente.

---

## 5. Alternativas evaluadas

### A. Mantener QR actual (`http://ip:port`) y pedir token manual

**Pros:** cambio mínimo en bridge.  
**Contras:** NO resuelve el problema de “connect por QR” de punta a punta. Sigue obligando entrada manual.  
**Decisión:** descartada como solución principal; mantener solo como compatibilidad legacy.

### B. QR con JSON arbitrario

Ejemplo: `{"ip":"192.168.1.10","port":8080,"token":"..."}`

**Pros:** flexible.  
**Contras:** peor interoperabilidad, peor debuggability, peor compatibilidad con deep links.  
**Decisión:** descartada.

### C. QR con deep link versionado

Ejemplo: `autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=...`

**Pros:**
- contrato explícito
- fácil de parsear
- sirve tanto para scanner in-app como para eventual apertura por deep link
- mantiene coherencia con el modelo actual de mobile (`ip`, `port`, `token`)

**Contras:**
- requiere cambio en bridge y en parser mobile
- obliga a cerrar el tema del scheme canónico

**Decisión:** **elegida**.

---

## 6. Decisiones de diseño

### 6.1 Contrato QR canónico v1

El QR canónico deberá codificar:

```text
autoreas-mobile://pair?v=1&ip={LAN_IP}&port={PORT}&token={PAIRING_TOKEN}
```

#### Reglas

- `v` es obligatorio para versionado futuro.
- `ip` es obligatoria.
- `port` es obligatoria.
- `token` es obligatorio y representa el **pairing token**, no el auth token.
- El payload NO incluye `auth_token`.
- El payload NO incluye `ws://...`; mobile deriva WS desde `ip` + `port` luego del pairing.

### 6.2 Scheme canónico

El scheme oficial pasa a ser:

```text
autoreas-mobile://
```

Motivo: ya es el scheme configurado en `autoreas-mobile/app.json`. La arquitectura tiene que alinearse con el runtime real, no con un deseo viejo de documentación.

### 6.3 Política de compatibilidad

No habrá compatibilidad retroactiva con formatos previos de QR.

El único formato válido para esta feature será:

```text
autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=abc123
```

Cualquier QR previo que encodee solo `http://ip:port` se considera **prueba de concepto descartada** y debe eliminarse del bridge, no preservarse.

### 6.4 Estrategia UX en mobile

Se adopta estrategia **prefill + auto-submit controlado + fallback visible**.

Flujo:

1. Usuario abre Setup.
2. Toca “Escanear QR”.
3. Mobile solicita permiso de cámara.
4. Si escanea QR v1 válido:
   - completa `ip`, `port`, `token`
   - intenta pairing automáticamente
5. Si pairing falla:
   - NO pierde los datos escaneados
   - vuelve al formulario editable
   - muestra error accionable
Esta estrategia es mejor que auto-navegar a ciegas porque protege contra QR stale, IP vieja, firewall o cambio de red. El usuario siempre conserva el control.

### 6.5 Semántica de auth oficial

El RFC corrige la documentación y adopta el contrato real del runtime:

- **Pairing token**
  - generado por bridge
  - consumido una sola vez en `POST /api/devices/pair`
  - transportado en el QR v1

- **Auth token**
  - devuelto por bridge al completar pairing
  - persistido por mobile
  - usado en `Authorization: Bearer ...` para REST/WS posteriores

### 6.6 Qué significa “paired”

Para evitar estados rotos, el sistema considerará que el dispositivo quedó emparejado solo cuando:

1. `POST /api/devices/pair` fue exitoso, y
2. la persistencia local terminó correctamente, y
3. `initialSync()` completó sin error fatal

Si el paso 3 falla, la implementación debe evitar dejar una config medio válida como si el pairing hubiera terminado bien.

---

## 7. Contrato funcional propuesto

### 7.1 Bridge → QR

El panel de pairing deberá generar el QR con el deep link versionado, no con el HTTP URL pelado.

Ejemplo:

```text
autoreas-mobile://pair?v=1&ip=192.168.1.10&port=8080&token=2f84a4f0f2b8...
```

### 7.2 Mobile → parseo

Mobile deberá agregar un parser de QR con estas salidas:

```ts
type PairingQrParseResult =
  | { kind: 'complete'; version: 1; ip: string; port: string; token: string }
  | { kind: 'invalid'; reason: string };
```

### 7.3 Mobile → pairing HTTP

No cambia el endpoint base:

```http
POST /api/devices/pair
Content-Type: application/json

{
  "pairing_token": "...",
  "device_name": "AutoreasMobile"
}
```

Respuesta esperada:

```json
{
  "device_id": "device-...",
  "device_name": "AutoreasMobile",
  "auth_token": "..."
}
```

### 7.4 Mobile → persistencia

Se mantiene la persistencia actual en SQLite para MVP, pero la documentación debe dejar de afirmar otra cosa hasta que el código cambie.

Persistido actual:

- `ip`
- `port`
- `token` (`auth_token`)
- `device_id`
- `device_name`

---

## 8. Impacto por aplicación

### 8.1 Cambios requeridos en `autoreas-mobile`

#### Nuevas capacidades

- lector QR / cámara
- manejo de permisos
- parser de QR v1
- CTA de “Escanear QR” en Setup
- recuperación elegante ante fallo de pairing

#### Ajustes de alineación

- unificar scheme a `autoreas-mobile://pair`
- dejar de depender de `autoreas://pair`
- corregir docs/specs desalineados
- endurecer el criterio de “paired” para no persistir estado incompleto

### 8.2 Cambios requeridos en `autoreas-bridge`

#### Nuevas capacidades

- cambiar el payload del QR al deep link versionado v1
- mantener visible la IP/puerto crudos y el token como fallback manual

#### Ajustes recomendados

- hacer explícita la distinción entre pairing token y auth token en docs/UI
- evitar que la UI dé a entender que el QR actual ya resuelve pairing completo si no lo hace
- tratar este RFC como la referencia narrativa mientras OpenSpec y docs del bridge quedan alineados

#### Hardening recomendado pero no bloqueante para MVP

- TTL para pairing tokens
- botón explícito de regenerar token/QR
- política de un único token pendiente o limpieza de tokens viejos
- override manual de NIC/IP cuando el host tenga varias interfaces

---

## 9. Riesgos y trade-offs

### Riesgo 1: QR stale

Si el bridge genera tokens sin expiración, un QR viejo puede seguir siendo válido demasiado tiempo.

**Mitigación MVP:** pairing token one-shot.  
**Mitigación ideal:** TTL de 5-10 minutos + regeneración explícita.

### Riesgo 2: IP incorrecta en hosts multihomed

El bridge hoy elige una IP efectiva que puede no ser la alcanzable desde la tablet.

**Mitigación MVP:** mantener edición manual post-scan.  
**Mitigación futura:** selector/override de interfaz.

### Riesgo 3: estado parcial en mobile

Hoy mobile puede persistir config antes de terminar `initialSync()`.

**Mitigación:** volver transaccional el cierre del pairing o introducir estado explícito de pairing incompleto.

### Riesgo 4: documentación mentirosa

Si no se corrige el contrato, cada app va a seguir implementando “su verdad”.

**Mitigación:** este RFC pasa a ser la referencia de pairing QR entre ambas apps.

---

## 10. Plan de implementación sugerido

### Fase 1 — Alineación de contrato

#### Bridge
- reemplazar QR PoC actual por payload v1
- mantener token visible/copiable como fallback manual

#### Mobile
- unificar scheme `autoreas-mobile`
- agregar parser QR v1
- agregar scanner QR en setup

### Fase 2 — UX resiliente

#### Mobile
- auto-submit tras scan válido
- fallback al formulario editable con mensaje claro
- mensajes específicos para:
  - bridge apagado
  - timeout
  - firewall
  - token inválido/consumido
  - QR inválido o ajeno al contrato oficial

### Fase 3 — Hardening

#### Bridge
- expiración de pairing token
- regeneración explícita
- limpieza de tokens viejos

#### Mobile
- evitar estado “paired” si `initialSync()` falla

---

## 11. Criterios de aceptación

### Escenario 1 — Pairing completo por QR v1

- GIVEN bridge muestra QR v1 válido
- WHEN mobile lo escanea desde Setup
- THEN mobile completa `ip`, `port`, `token`
- AND ejecuta pairing automáticamente
- AND persiste `auth_token` + `device_id`
- AND navega al shell principal solo si el bootstrap posterior fue exitoso

### Escenario 2 — Fallback tras error de red

- GIVEN mobile escaneó un QR v1 válido
- WHEN el pairing falla por timeout/red/firewall
- THEN la app mantiene los datos escaneados visibles en el formulario
- AND permite edición manual
- AND muestra mensaje accionable

### Escenario 3 — QR inválido

- GIVEN mobile escanea un QR no compatible
- WHEN parsea el contenido
- THEN no intenta pairing
- AND informa que el QR no pertenece a Autoreas Bridge

---

## 12. Decisiones explícitas para cerrar ambigüedad

1. **El QR canónico NO es `http://ip:port`; cualquier variante previa queda descartada como PoC y debe eliminarse.**
2. **El scheme oficial es `autoreas-mobile://`.**
3. **El contrato oficial de pairing usa `pairing_token` de entrada y `auth_token` de salida.**
4. **El pairing por QR debe ser completo en el happy path; no solo prefill de host.**
5. **El formulario manual sigue existiendo como fallback de resiliencia.**

---

## 13. Evidencia principal usada para este RFC

### Mobile

- `autoreas-mobile/src/features/setup/use-pair-device.ts`
- `autoreas-mobile/src/features/setup/ui/SetupScreen/use-setup-screen.ts`
- `autoreas-mobile/src/features/setup/ui/SetupScreen/setup-screen.helpers.ts`
- `autoreas-mobile/src/infrastructure/db/schema.ts`
- `autoreas-mobile/app.json`
- `autoreas-mobile/docs/specs/07-setup-device.md`

### Bridge

- `autoreas-bridge/frontend/src/features/dashboard/ui/PairingPanel/pairing-panel.helpers.ts`
- `autoreas-bridge/frontend/src/features/dashboard/ui/PairingPanel/use-pairing-panel.ts`
- `autoreas-bridge/internal/api/router.go`
- `autoreas-bridge/internal/device/service.go`
- `autoreas-bridge/app.go`
- `autoreas-bridge/openspec/specs/frontend/spec.md`
- `autoreas-bridge/docs/architecture.md`

---

## 14. Resultado esperado

Después de este cambio, el usuario podrá:

1. abrir Setup en mobile,
2. tocar “Escanear QR”,
3. leer el QR del bridge,
4. quedar emparejado sin tipear IP, puerto ni token,
5. seguir teniendo fallback manual si la red o el bridge no cooperan.

Eso, recién ESO, es un flujo de connect por QR de verdad.
