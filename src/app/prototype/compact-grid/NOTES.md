# Prototipo: rejilla compacta (3ª densidad móvil)

**Pregunta que responde:** ¿Cómo debería verse una vista ultra-compacta tipo
rejilla de chips que reduzca el scroll en móvil, abriendo el `VisitCard` real
en una ventana emergente al tocar un chip?

**Cómo probarlo:** arranca el dev server normal y abre
`/prototype/compact-grid` (logueado, en un día con tráfico). Cambia de variante
con la barra flotante inferior o con las flechas ← →. Toca cualquier chip para
ver el modal con el `VisitCard` real.

## Variantes

- **A — Matrícula pura:** rejilla densísima 3-4 col, solo matrícula + hora +
  contador de servicios pendientes. Máximo nº de vuelos por pantalla (iconos).
- **B — Chip con contexto:** 2 col, matrícula + tipo + LLEG/SAL con horas +
  parking + servicios. Más legible, menos por pantalla.
- **C — Agrupado por estado:** secciones colapsables ("carpetas") por estado del
  vuelo, con chips compactos dentro. Buen escaneo por fase operativa.

## Veredicto

> _(rellenar tras probar: ¿qué variante gana? ¿se mezclan piezas — p.ej. la
> densidad de A con la agrupación de C? ¿el modal sobre la rejilla funciona en
> móvil o preferimos bottom-sheet?)_

## Al cerrar

Cuando haya ganadora: plegarla en `src/app/page.tsx` como una 3ª densidad
(toggle junto a los filtros) y **borrar esta carpeta entera** + la barra.
