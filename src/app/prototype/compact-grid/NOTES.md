# Prototipo: rejilla compacta (3ª densidad móvil)

**Pregunta que responde:** ¿Cómo debería verse una vista ultra-compacta tipo
rejilla de chips que reduzca el scroll en móvil, abriendo el `VisitCard` real
en una ventana emergente al tocar un chip?

**Cómo probarlo:** arranca el dev server normal y abre
`/prototype/compact-grid` (logueado, en un día con tráfico). Cambia de variante
con la barra flotante inferior o con las flechas ← →. Toca cualquier chip para
ver el modal con el `VisitCard` real.

## Variantes

- **A — Fusión A+C (ELEGIDA):** las tarjetas densas de la A (matrícula +
  **llegada/salida** + **aeropuerto relevante** origen/destino + contador de
  servicios; hora en 2º plano) pero **agrupadas por estado** en secciones
  colapsables como la C (orden de ciclo de vida, contador por sección).
- **B — Chip con contexto:** 2 col, matrícula + tipo + LLEG/SAL con horas +
  parking + servicios. Más legible, menos por pantalla.
- **C — Agrupado por estado:** secciones colapsables ("carpetas") por estado del
  vuelo, con chips compactos dentro. Buen escaneo por fase operativa.

## Veredicto

> **Gana la A** (máxima densidad). Refinada: en vez de la hora, el chip prioriza
> si lo que importa es la **llegada o la salida** y el **aeropuerto** relevante
> (origen/destino). La hora pasa a secundaria. Regla de fase: `EXPECTED` → llegada
> desde origen; en tierra → salida hacia destino.
>
> Pendiente de decidir antes de plegar a producción: ¿se mezcla la agrupación por
> estado de la C? ¿modal vs bottom-sheet en móvil?

## Al cerrar

Cuando haya ganadora: plegarla en `src/app/page.tsx` como una 3ª densidad
(toggle junto a los filtros) y **borrar esta carpeta entera** + la barra.
