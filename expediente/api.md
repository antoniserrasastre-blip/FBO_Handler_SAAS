# API Endpoints — FBO Handler SaaS

Todas las rutas bajo `src/app/api/`. Guards de rol con NextAuth.

## Vuelos (Visit + Movement)

| Método | Ruta | Función | Rol mínimo |
|---|---|---|---|
| GET | `/api/flights` | Listar vuelos del palmaDay | VIEWER |
| GET | `/api/flights/[id]` | Detalle de un vuelo | VIEWER |
| PUT | `/api/flights/[id]` | Actualizar estado/datos | HANDLER |
| POST | `/api/flights/[id]/services` | Agregar servicio | HANDLER |
| PUT | `/api/flights/[id]/services/[sid]` | Actualizar estado servicio | HANDLER |
| POST | `/api/flights/[id]/passengers` | Agregar pasajero | HANDLER |
| PUT | `/api/flights/[id]/passengers/[pid]` | Actualizar pasajero | HANDLER |
| POST | `/api/flights/[id]/crew` | Asignar crew | HANDLER |
| PUT | `/api/flights/[id]/crew/[cid]` | Actualizar crew | HANDLER |
| POST | `/api/flights/[id]/tasks` | Crear/completar tarea checklist | HANDLER |
| POST | `/api/flights/[id]/lost-items` | Registrar item perdido | HANDLER |
| POST | `/api/flights/[id]/crew-items` | Registrar item almacén crew | HANDLER |
| POST | `/api/flights/[id]/gendec/extract` | Parsear GENDEC pegado | HANDLER |

## Importación

| Método | Ruta | Función |
|---|---|---|
| POST | `/api/import` | Importar PDF Cybermax (vuelos del día) |
| POST | `/api/import/extras` | Importar Excel Mallorcair (servicios) |
| POST | `/api/import/netjets-pax` | Importar pasajeros NetJets PDF |

## Exportación

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/export/flight/[id]/pdf` | PDF individual de vuelo |
| GET | `/api/export/flight/[id]/excel` | Excel individual de vuelo |
| GET | `/api/export/daily/pdf` | PDF de todos los vuelos del día |
| GET | `/api/export/daily/excel` | Excel de todos los vuelos del día |
| GET | `/api/export/blank-declaration` | Formulario en blanco |

## Tiempo real y estado

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/events` | SSE stream (server-sent events) |
| GET | `/api/live/flights` | Vuelos enriquecidos con live tracking |
| GET | `/api/live/poll` | Trigger poll ADS-B (OpenSky) |
| GET | `/api/live/status` | Estado del live tracking |

## Turnos

| Método | Ruta | Función |
|---|---|---|
| POST | `/api/shift` | Iniciar o cerrar turno |
| GET | `/api/shift` | Estado del turno actual |

## Datos y métricas

| Método | Ruta | Función |
|---|---|---|
| GET | `/api/daysheets` | Listar hojas de día |
| POST | `/api/daysheets` | Crear hoja de día |
| GET | `/api/metrics` | Métricas del día (pax, crew, servicios) |

## Sistema y DB

| Método | Ruta | Función | Rol |
|---|---|---|---|
| GET | `/api/health` | Health check | Público |
| GET | `/api/db/status` | Estado de la DB | ADMIN |
| POST | `/api/db/migrate` | Ejecutar migrations Prisma | ADMIN |
| GET | `/api/db/crypto-status` | Estado encriptación | ADMIN |

## Notas

- Todos los endpoints PATCH/PUT tienen whitelist de campos permitidos (no blind spread).
- Cada cambio de estado relevante emite un evento al SSE bus (`src/lib/events.ts`).
- Los datos de pasajeros/crew se desencriptan solo en el endpoint de detalle, bajo autenticación.
