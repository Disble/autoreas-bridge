# Aviso de duración especial — flujo a nivel de usuario (propuesta)

> **Propuesta, no implementado.** Versión simple para entender la idea.
> El detalle formal queda como respaldo en
> [episode-identity-triage.md](episode-identity-triage.md)
> ([diagrama técnico](episode-identity-triage.html)).

## La idea en una frase

Si en la carpeta de un anime hay un vídeo mucho más largo que los demás,
Bridge te lo cuenta con un aviso informativo. No te dice qué capítulo es
ni cuál vas a ver: solo que existe.

## Paso a paso

| Paso | Quién | Qué pasa |
|---|---|---|
| 1 | Tú | Tienes la carpeta del anime. Da igual su origen: Bridge, otro descargador o una copia. |
| 2 | Bridge | Mide cuánto dura cada vídeo, sin mover ni renombrar nada. |
| 3 | Bridge | Calcula la duración habitual (la de la mayoría, p. ej. ~24 min). |
| 4 | Bridge | ¿Hay un vídeo mucho más largo (p. ej. ~41 min)? Si no, no hace nada. |
| 5 | Bridge | Cruza tu progreso registrado con el triage de archivos: si vas por el capítulo N−1 y el archivo identificado con **confianza alta** como N es largo, prepara el aviso justo a tiempo. Con confianza menor, solo queda la marca genérica del anime. |
| 6 | Tú | Cuando llegas al capítulo anterior, Bridge te dice: «el siguiente dura ~40 min». Un hallazgo, un aviso: no se repite al entrar a Today. |

Ejemplo de aviso:

> **Duración especial en este anime**
> En su carpeta hay un vídeo de aproximadamente 41 minutos.
> La duración habitual de los vídeos ronda los 24 minutos.

## Lo que este flujo no promete

- No identifica el número de capítulo (los nombres pueden estar cambiados desde fuera).
- No sabe qué capítulo verás a continuación.
- No observa la reproducción (ocurre en otras apps y dispositivos).
- Si un archivo no se puede leer, se ignora sin bloquear nada.
- Solo aplica a anime de tipo **TV** con duración “por episodio” en catálogo. Películas, OVAs y especiales quedan fuera: una película de una hora es lo normal, no un aviso.

Diagrama visual: [episode-identity-triage-user-flow.html](episode-identity-triage-user-flow.html).
