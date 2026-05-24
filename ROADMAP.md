# ROADMAP

## v0.2 — Hecho (Panel de Operaciones)
- [x] CRUD de vuelos y estados.
- [x] Importación PDF (Cybermax) y Excel (Extras).
- [x] Gestión de servicios y catering.
- [x] Sincronización en tiempo real (SSE).
- [x] Exportación CSV, PDF (AENA) y Excel Diario.
- [x] **Hotfix Zonas Horarias**: Fechas normalizadas a medianoche UTC de Palma.

## v0.3 — Hecho (Modo Turno y Métricas)
- [x] **Modo turno**: fichaje por puestos (Rampa/Llegadas/Salidas/Runner/Coordinador) y vista filtrada por la cola de cada puesto.
- [x] **Checklists adaptativos por puesto**: tareas según el vuelo, agrupadas por fase Llegada/Salida; rampa como flujo operativo real.
- [x] **Inventario de crew**: objetos guardados en la llegada y devueltos en la salida.
- [x] **Asignación de vuelos**: el coordinador asigna y el pistero ve los suyos ("Mío" + filtro "Mis vuelos").
- [x] **Dashboard de métricas** (`/metrics`): KPIs, puntualidad real (ATA/ATD), pasaje y previsión a 7 días.
- [x] **Catálogo de aeropuertos**: ICAO + búsqueda por ciudad + fallback OurAirports en servidor.
- [x] **Vista /dia**: tabla densa de un vistazo (estilo Excel).
- [x] Servicios limpieza/escalera/ASU + resaltado de la cola por puesto.

## v0.4 — Próximamente (Control y Densidad)
- [ ] **Control de Equipaje**: etiquetas Dymo y estados de bodega/cabina.
- [ ] **Marcador * (Sin Contrato)**: aviso visual para vuelos que deben pagar.
- [ ] **Manual de Filtro 2026**: sección de ayuda integrada.
- [ ] **WebSockets**: mejorar sincronización (sustituir SSE).
- [ ] **Gantt/Timeline**: vista temporal de vuelos en tierra.
- [ ] **Integración FlightRadar**: datos reales de llegada.
