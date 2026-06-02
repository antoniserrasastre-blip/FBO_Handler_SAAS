# API Endpoints — FBO Handler SaaS

Superficie HTTP bajo `src/app/api/`. Derivado del código (`route.ts`), no de memoria.
El path se deriva de la estructura App Router; `[id]` es parámetro dinámico.

## Guards de rol (`src/lib/roles.ts`)

| Guard | Permite | Rechaza |
|---|---|---|
| `requireWriter()` | ADMIN, SUPERVISOR, HANDLER | VIEWER (403), sin sesión (401) |
| `requireSupervisor()` | ADMIN, SUPERVISOR | resto (403), sin sesión (401) |
| `requireAdmin()` | ADMIN | resto (403), sin sesión (401) |
| `getServerSession` directo | cualquier usuario autenticado | sin sesión (401, manual en cada handler) |
| `SETUP_SECRET` (query/header) | quien presente el secreto | resto (401). NO usa NextAuth |
| sin guard | público | — |

Notas:
- "Auth" = el handler solo llama `getServerSession` y exige sesión, sin discriminar rol (lectura para cualquier rol, incluido VIEWER).
- Varias rutas combinan: el guard de escritura más `getServerSession` para obtener el `userId` del autor.

## Vuelos (flights)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/flights` | Auth | Listar vuelos (Visit+Movement) del palmaDay |
| POST | `/api/flights` | requireWriter | Crear vuelo manual |
| PATCH | `/api/flights/[id]` | requireWriter | Actualizar vuelo (whitelist de campos) |
| DELETE | `/api/flights/[id]` | requireWriter | Eliminar vuelo |
| POST | `/api/flights/[id]/services` | requireWriter | Añadir servicio al vuelo |
| GET | `/api/flights/[id]/passengers` | Auth | Listar pasajeros (descifra PII) |
| POST | `/api/flights/[id]/passengers` | requireWriter | Añadir pasajero |
| GET | `/api/flights/[id]/crew` | Auth | Listar crew del vuelo |
| POST | `/api/flights/[id]/crew` | requireWriter | Asignar crew |
| GET | `/api/flights/[id]/tasks` | Auth | Listar checklist de tareas |
| PUT | `/api/flights/[id]/tasks` | requireWriter | Crear/actualizar tarea checklist |
| GET | `/api/flights/[id]/lost-items` | Auth | Listar items perdidos del vuelo |
| POST | `/api/flights/[id]/lost-items` | requireWriter | Registrar item perdido |
| GET | `/api/flights/[id]/crew-items` | Auth | Listar items de almacén crew |
| POST | `/api/flights/[id]/crew-items` | requireWriter | Registrar item almacén crew |
| PATCH | `/api/flights/[id]/crew-items` | requireWriter | Actualizar item almacén crew |
| DELETE | `/api/flights/[id]/crew-items` | requireWriter | Borrar item almacén crew |
| POST | `/api/flights/[id]/gendec/extract` | requireWriter | Parsear GENDEC pegado (extrae crew/pax) |

## Subentidades (acceso por id propio)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| PATCH | `/api/services/[id]` | requireWriter | Actualizar estado/datos de servicio |
| DELETE | `/api/services/[id]` | requireWriter | Eliminar servicio |
| PATCH | `/api/passengers/[id]` | requireWriter | Actualizar pasajero |
| DELETE | `/api/passengers/[id]` | requireWriter | Eliminar pasajero |
| PATCH | `/api/crew/[id]` | requireWriter | Actualizar asignación de crew |
| DELETE | `/api/crew/[id]` | requireWriter | Eliminar asignación de crew |
| PATCH | `/api/lost-items/[id]` | requireWriter | Actualizar item perdido |
| DELETE | `/api/lost-items/[id]` | requireWriter | Eliminar item perdido |

## Presets de servicio (service-presets)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/service-presets` | Auth | Listar presets de servicio |
| POST | `/api/service-presets` | requireWriter | Crear preset de servicio |
| DELETE | `/api/service-presets/[id]` | requireWriter | Eliminar preset (autoría individual) |

## Importación (import)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| POST | `/api/import` | requireWriter | Importar PDF Cybermax (vuelos del día) |
| PUT | `/api/import` | requireWriter | Confirmar/aplicar import de vuelos |
| POST | `/api/import/extras` | requireWriter | Importar Excel Mallorcair (servicios) |
| PUT | `/api/import/extras` | requireWriter | Confirmar/aplicar import de extras |
| POST | `/api/import/netjets-pax` | requireWriter | Importar pasajeros NetJets PDF |

## Exportación (export)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/export` | sin guard | DEPRECADO — devuelve 503 (pausado en migración v2) |
| GET | `/api/export/flight/[id]/pdf` | sin guard | PDF individual de vuelo |
| GET | `/api/export/flight/[id]/excel` | sin guard | Excel individual de vuelo |
| GET | `/api/export/daily/pdf` | sin guard | PDF de todos los vuelos del día |
| GET | `/api/export/daily/excel` | sin guard | Excel de todos los vuelos del día |
| GET | `/api/export/blank-declaration` | sin guard | Formulario AENA en blanco |

## Tiempo real y estado (live, events)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/events` | Auth | SSE stream (server-sent events) |
| GET | `/api/live/flights` | Auth | Vuelos enriquecidos con live tracking |
| POST | `/api/live/poll` | sin guard | DEPRECADO — devuelve 503 (live en pausa v2) |
| GET | `/api/live/status` | Auth | Estado del live tracking |

## Turnos (shift)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/shift` | Auth | Estado del turno actual |
| POST | `/api/shift` | Auth | Iniciar turno |
| PATCH | `/api/shift` | Auth | Actualizar turno |
| DELETE | `/api/shift` | Auth | Cerrar/eliminar turno |

## Datos y métricas (daysheets, metrics)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/daysheets` | Auth | Listar hojas de día |
| POST | `/api/daysheets` | requireWriter | Crear hoja de día |
| DELETE | `/api/daysheets` | requireSupervisor (o requireAdmin si `?all=true`) | Borrar visitas de un día; `?all=true` purga TODO |
| GET | `/api/metrics` | Auth | Métricas del día (pax, crew, servicios) |

## Usuarios (users)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/users` | requireAdmin | Listar usuarios |
| POST | `/api/users` | requireAdmin | Crear usuario |
| PATCH | `/api/users/[id]` | requireAdmin | Actualizar usuario (rol/datos) |
| DELETE | `/api/users/[id]` | requireAdmin | Eliminar usuario |

## Admin / mantenimiento

| Método | Ruta | Guard | Función |
|---|---|---|---|
| POST | `/api/admin/migrate-crew-items` | requireAdmin | Migración puntual de crew-items |

## Auth (NextAuth)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET / POST | `/api/auth/[...nextauth]` | sin guard | Handler NextAuth (login/logout/session/callbacks) |

## Sistema y DB (health, setup, db)

| Método | Ruta | Guard | Función |
|---|---|---|---|
| GET | `/api/health` | sin guard | Health check (`{ ok: true }`) |
| GET | `/api/setup` | `SETUP_SECRET` (header `x-setup-secret`) | Sembrar usuarios base desde env |
| GET | `/api/db/status` | `SETUP_SECRET` (query `?secret=`) | Diagnóstico de esquema/tablas (metadata) |
| GET | `/api/db/crypto-status` | `SETUP_SECRET` (query `?secret=`) | Diagnóstico de la clave PII |
| POST / GET | `/api/db/migrate` | `SETUP_SECRET` (header `x-setup-secret`) | Materializar esquema V2 en Turso (`?reset=v1` borra V1) |

## Notas

- Endpoints PUT/PATCH usan whitelist explícita de campos permitidos (sin blind spread del body).
- Cada cambio de estado relevante emite evento al SSE bus (`src/lib/events.ts`).
- PII de pasajeros/crew se descifra solo en endpoints autenticados (detalle/listado bajo `getServerSession`).
- Los endpoints `db/*`, `setup` y `db/migrate` se autentican con `SETUP_SECRET`, NO con NextAuth (callables desde navegador/curl, excluidos del middleware).
- `/api/export` (raíz) y `/api/live/poll` están deprecados durante la migración v2: devuelven 503.
