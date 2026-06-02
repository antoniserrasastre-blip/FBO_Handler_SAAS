---
name: cerrar-dia
description: Closes a work session — updates estado.md (checks off finished pendientes, adds new ones, records decisions and alerts) and appends what was done, decided or broke to expediente/historial/AAAA-MM.md. Use at the end of a work session or when the user says "cerrar el día", "wrap up", "log what we did", "anota lo de hoy".
---

# Cerrar día

`estado.md` es el único fichero vivo: solo sirve si se reescribe cada sesión. Esta skill es ese ritual. Sin él, `estado.md` se queda viejo y pasa a mentir con autoridad — el fallo exacto que mata el sistema de carpetas.

## Procedimiento

1. **Recordar la sesión.** Ejecuta `git log --oneline -15` y `git diff --stat main...HEAD` (y revisa el hilo de la conversación) para reconstruir qué se hizo, decidió o rompió hoy.

2. **Actualizar `estado.md`** (la foto del presente):
   - **Tacha** los pendientes resueltos esta sesión (o bórralos si ya no aplican).
   - **Añade** los pendientes nuevos descubiertos.
   - **Decisiones de alcance** tomadas hoy → a su sección.
   - **Alertas** activas nuevas o resueltas.
   - Si tocaste código, refleja la "Situación actual" y las cifras de test reales (`npx vitest run`).
   - Sella `_Última actualización:_` con `date +%F`.

3. **Volcar al historial.** Añade (append, no sobrescribas) una entrada fechada a `expediente/historial/AAAA-MM.md` (nombre del mes con `date +%Y-%m`; créalo si no existe). Formato:

   ```markdown
   ## AAAA-MM-DD — <título corto de la sesión>

   **Hecho:** <qué se completó, con refs por símbolo/fichero>
   **Decidido:** <decisiones y su porqué>
   **Roto / pendiente:** <lo que quedó a medias o se rompió>
   ```

   El historial CRECE (no se reescribe); `estado.md` CAMBIA (refleja solo el presente). Mueve al historial el detalle que ya no es "presente".

4. **Verificar coherencia.** Si cambiaste código pero las hojas del expediente no reflejan aún ese cambio, recuérdalo y sugiere `actualizar-expediente` antes de cerrar.

5. **Commit.** Ofrece commitear los cambios de docs (no disparan deploy por `paths-ignore`). Si hay commits de código locales sin empujar, recuérdalo.

## Regla de oro

Los números (cifras de test, conteos) los pone un comando (`vitest`, `tsc`), nunca tu memoria. Ejecuta y copia el resultado real.
