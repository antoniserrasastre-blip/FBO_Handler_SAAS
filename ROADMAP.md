# ROADMAP

> Lo que está hecho vive en `expediente/historial/`. Lo activo vive en `expediente/estado.md`. Este fichero solo mira hacia adelante.

## v0.3 — En curso

- [x] **Vista /dia**: Tabla densa de un vistazo.
- [x] **Timeline**: Vista temporal de vuelos en tierra.
- [ ] **Control de Equipaje**: Etiquetas Dymo y estados de bodega/cabina.
- [ ] **Marcador * (Sin Contrato)**: Aviso visual para vuelos que deben pagar.
- [ ] **Manual de Filtro 2026**: Sección de ayuda integrada.

## v0.4 — Próximamente

- [ ] **WebSockets**: Mejorar sincronización (sustituir SSE). Ver `docs/adr/0001-eventbus-single-container.md` para contexto.
- [ ] **Integración FlightRadar / OpenSky**: live tracking ADS-B en producción (hoy en stubs).
- [ ] **Integración AENA app↔microservicio**: hoy el microservicio existe en standalone; falta cablearlo al flujo de exportación.
