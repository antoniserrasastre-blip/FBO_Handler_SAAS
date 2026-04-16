# FBO Handler SAAS — Plan de Proyecto

## Visión

Plataforma web que sustituye la hoja de papel "Orden del día" y las hojas Excel de extras de MALLORCAIR S.L. (LEPA). Permite a todo el equipo de handling ver en tiempo real el estado de cada vuelo, pasajero, tripulación y servicio durante la jornada.

---

## Contexto

### Problema actual
- La "Orden del día" es un PDF generado por Cybermax que se imprime y se tacha a mano durante el turno.
- Los extras (catering, hielo, thermos...) se gestionan en Excel aparte.
- La información está fragmentada: para responder una pregunta simple ("¿ha repostado el VJT630?") hay que buscar en papel, preguntar por radio, o recordar de memoria.
- No hay visibilidad compartida: cada persona sabe solo lo que ha visto o le han dicho.

### Solución
Un panel de operaciones web donde cada vuelo es una tarjeta con estados visuales. Cualquier miembro del equipo puede ver y actualizar el estado en tiempo real desde su puesto.

---

## Entidades principales

### Vuelo (Flight)
- Indicativo (callsign): ej. VJT630
- Matrícula: ej. 9H-ILY
- Tipo de aeronave: ej. CRJ2
- Origen (ICAO) + hora de llegada (ETA)
- Destino (ICAO) + hora de salida (ETD)
- Parking asignado
- TOBT (Target Off-Block Time) — se puede adelantar máx. 10 min vía CDM
- Estado: `esperado` → `en_tierra` → `embarque` → `despachado`
- Crew llegada / Crew salida (pueden diferir)
- Pax llegada / Pax salida
- Log temporal de eventos (cada acción registra timestamp automático)

### Pasajeros (Passengers)
- Asociados a un vuelo (llegada o salida)
- Maletas bodega (cantidad)
- Maletas cabina (cantidad)
- Estado maletas: `pendiente` → `enviadas_a_avion`
- Alerta automática: si pax salida > 5 → "2 FURGONETAS"
- Transporte: `coche_alquiler` | `coche_preparado` | `taxi` | `sin_definir`
- Estado transporte: `pendiente` → `confirmado`
- Estado pasajeros: `no_llegados` → `en_sala` → `embarcados`

### Tripulación (Crew)
- Asociados a un vuelo
- Ubicación: `en_avion` | `en_sala`
- Contador de cruces de filtro

### Extras / Servicios (Services)
Cada vuelo puede tener N servicios. Tipos predefinidos con icono:
| Tipo | Icono |
|------|-------|
| Catering | 🍽️ |
| Vajillas | 🍽️ |
| Bolsa nevera | 🧊 |
| Bolsa almacén | 📦 |
| Laundry | 👔 |
| Thermos | ☕ |
| Periódicos | 📰 |
| Extra comodín | 🔧 (nombre libre) |

Cada servicio tiene:
- Estado: `pendiente` → `entregado`
- Timestamp de entrega (automático al marcar)
- Origen: Crossroads / Catering Aire / Otro

### Combustible (Fuel)
- Estado: `no_pedido` → `pedido` → `servido`
- Timestamp de cada cambio

### Otros servicios de rampa
- Toilet service: `pendiente` → `completado`

---

## Interfaz de usuario

### Pantalla principal — Panel de operaciones

**Cabecera fija:**
```
MALLORCAIR · LEPA · 13/04/26                         Antoni (admin)
En tierra: 8  │  Esperados: 4  │  Pax en sala: 12  │  ⚠️ 2 alertas
```

**Cuerpo — Lista de vuelos ordenados por hora:**

Cada vuelo es una tarjeta colapsable con código de color por estado:
- Gris: Esperado
- Azul: En tierra
- Amarillo: Embarque
- Verde: Despachado
- Rojo: Alerta (requiere atención)

**Tarjeta colapsada** — vista rápida:
```
🔵 EN TIERRA   VJT630 · CRJ2 · 9H-ILY · P232
LOWI 12:30 ──────────────────── GMME 14:00
  LLEGADA           │         SALIDA
  Crew: 3  Pax: 0   │         Crew: 3  Pax: 5 ⚠️ 2FURG
                    │         Bags: 7B+2C  En sala
Fuel: ⬜  🍽️✅ 🧊✅ ☕⬜ 📰✅   Transporte: coche ✅
```

**Tarjeta expandida** — detalle completo:
- Sección LLEGADA: origen, ETA, hora real de aterrizaje, parking
- Sección TRIPULACIÓN: cantidad, ubicación (avión/sala), cruces de filtro
- Sección PASAJEROS LLEGADA: cantidad, maletas, transporte
- Sección PASAJEROS SALIDA: cantidad, maletas (bodega/cabina), estado maletas, transporte, alerta furgonetas
- Sección EXTRAS: lista de servicios con checkboxes y timestamps
- Sección SALIDA: destino, ETD, TOBT, estado embarque
- Sección LOG: cronología de todos los eventos del vuelo

### Otras pantallas
- **Login**: autenticación por usuario y contraseña
- **Admin**: gestión de usuarios y roles
- **Histórico**: consulta de días anteriores (snapshots de 24h)
- **Importación**: carga de la hoja del día (desde PDF o entrada manual)

---

## Roles de usuario

| Rol | Permisos |
|-----|----------|
| Admin | Todo: gestión de usuarios, configuración, edición, visualización |
| Handler | Ver y editar estado de vuelos, extras, pasajeros, tripulación |
| Viewer | Solo lectura (futuro, si dirección lo necesita) |

---

## Stack técnico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Frontend | Next.js (React) + TypeScript | SSR, buen DX, escalable |
| Estilos | Tailwind CSS | Rápido para UI tipo dashboard |
| Estado real-time | WebSockets o Server-Sent Events | Todos ven cambios al instante |
| Backend / API | Next.js API Routes o tRPC | Mismo proyecto, tipado end-to-end |
| Base de datos | PostgreSQL | Relacional, robusto, histórico |
| ORM | Prisma | Migraciones, tipado, buena DX |
| Autenticación | NextAuth.js (Auth.js) | Multi-usuario, roles, sesiones |
| Despliegue | Vercel o similar | Deploy fácil, preview por PR |

---

## Fases de desarrollo

### Fase 1 — MVP: Panel de operaciones básico
**Objetivo**: Sustituir la hoja de papel para un día de trabajo.

- [ ] Setup del proyecto (Next.js + Tailwind + Prisma + PostgreSQL)
- [ ] Modelo de datos: vuelos, servicios, pasajeros, tripulación
- [ ] Autenticación básica (login/logout, rol admin y handler)
- [ ] Pantalla principal: lista de vuelos como tarjetas colapsables
- [ ] Estados de vuelo con colores (esperado/en tierra/embarque/despachado)
- [ ] Tarjeta expandida con toda la info del vuelo
- [ ] Marcar extras como entregados (con timestamp)
- [ ] Registro de maletas (bodega/cabina) y alerta >5 pax
- [ ] Estado de tripulación (avión/sala) y cruces de filtro
- [ ] Combustible y toilet service
- [ ] Transporte de pasajeros
- [ ] Entrada manual de vuelos (crear/editar la hoja del día)
- [ ] Cabecera con resumen del día

### Fase 2 — Tiempo real y colaboración
**Objetivo**: Que todo el equipo trabaje sobre la misma pantalla.

- [ ] WebSockets / SSE para actualizaciones en tiempo real
- [ ] Indicador de quién modificó qué y cuándo
- [ ] Log temporal por vuelo (cronología de eventos)
- [ ] Notificaciones/alertas visuales (vuelo <1.5h turnaround con extras pendientes)

### Fase 3 — Importación y automatización
**Objetivo**: Reducir entrada manual de datos.

- [ ] Importación de PDF de Cybermax (parseo de la hoja del día)
- [ ] Posible integración con API de Cybermax (si existe)
- [ ] Conexión con FlightRadar/ESIA para estado de vuelo automático (investigar APIs)

### Fase 4 — Histórico y reporting
**Objetivo**: Guardar registros y facilitar facturación.

- [ ] Snapshot automático cada 24h
- [ ] Pantalla de histórico: consultar días anteriores
- [ ] Exportación de datos (extras servidos, servicios facturables)

### Fase 5 — Mobile y tablet
**Objetivo**: Uso desde dispositivos móviles en pista.

- [ ] Diseño responsive completo
- [ ] PWA (Progressive Web App) para uso tipo app nativa
- [ ] Optimización para pantallas pequeñas (tarjetas simplificadas)

### Fase 6 — Escalabilidad (futuro)
- [ ] Multi-aeropuerto (si MALLORCAIR expande)
- [ ] Rol viewer para dirección
- [ ] Integración con Crossroads/Catering Aire para extras automáticos
- [ ] Dashboard de métricas (vuelos/día, extras más solicitados, etc.)

---

## Estructura del repositorio (propuesta)

```
FBO_Handler_SAAS/
├── PLAN.md                    ← este documento
├── README.md
├── package.json
├── prisma/
│   └── schema.prisma          ← modelo de datos
├── src/
│   ├── app/                   ← páginas Next.js (App Router)
│   │   ├── page.tsx           ← panel principal
│   │   ├── login/
│   │   ├── admin/
│   │   └── historico/
│   ├── components/
│   │   ├── FlightCard.tsx     ← tarjeta de vuelo (colapsada/expandida)
│   │   ├── FlightList.tsx     ← lista de vuelos del día
│   │   ├── ServiceCheckbox.tsx
│   │   ├── DaySummary.tsx     ← cabecera con resumen
│   │   └── ...
│   ├── lib/
│   │   ├── db.ts              ← cliente Prisma
│   │   ├── auth.ts            ← configuración autenticación
│   │   └── realtime.ts        ← lógica WebSocket/SSE
│   └── types/
│       └── index.ts           ← tipos compartidos
└── public/
```

---

---

## Documentos de referencia (`docs/`)

Los archivos en `docs/` son muestras reales del flujo operativo de MALLORCAIR. Se organizan en tres categorías:

### Categoría A — Orden del Día (Cybermax PDF)
Hojas de vuelo diarias generadas por Cybermax. Tablas con LLEGADAS y SALIDAS: indicativo, origen/destino, hora, matrícula, tipo, parking, crew, pax. PDF digital, parseables.

| Archivo | Fecha |
|---------|-------|
| `01 APR.PDF` | 01/04 |
| `02APR.PDF` | 02/04 |
| `03APR.PDF` | 03/04 |
| `04APR.PDF` | 04/04 |
| `05APR.PDF` | 05/04 |
| `06ABRIL.PDF` | 06/04 |
| `07APR.PDF` | 07/04 |
| `08APR.PDF` | 08/04 |
| `09APR.PDF` | 09/04 |
| `10APR.PDF` | 10/04 |
| `11APR.PDF` | 11/04 |
| `12.abril.PDF` | 12/04 |
| `13APR.PDF` | 13/04 |
| `14-04.PDF` | 14/04 |
| `15APR.PDF`, `15APR (1).PDF` | 15/04 |
| `16apr (1).PDF` | 16/04 |

### Categoría B — Declaraciones Generales (AENA)
Formularios oficiales "DETALLE DE VUELOS EN TERMINAL DE AVIACIÓN GENERAL — AEROPUERTO PMI". Documentos escaneados con datos manuscritos/rellenados: nombres de tripulación y pasajeros, fecha de nacimiento, número de pasaporte/DNI, nacionalidad, firma del agente. Un formulario por operación (llegada o salida).

| Archivo | Contenido |
|---------|-----------|
| `13 APR.pdf` (150 KB) | Declaraciones individuales — 13/04 |
| `LLEGADAS 13 ABRIL.pdf` (2.1 MB) | Lote de declaraciones de llegada — 13/04 |
| `SALIDAS 13 ABRIL.pdf` (2.8 MB) | Lote de declaraciones de salida — 13/04 |

### Categoría C — Hoja de Extras (Excel)
Hojas de extras diarias de MALLORCAIR. Columnas de matrícula + descripción de servicios (catering, thermos, nevera, prensa, etc.), secciones especiales: Catering Aire, Catering NetJets (con referencia NJE), Prensa MCR & Relay.

| Archivos | Contenido |
|----------|-----------|
| `1 - copia (1).xlsx` a `1 - copia (14).xlsx` | 14 días de extras (01/04 a 14/04) |

### Uso de estos documentos
- **Cat. A**: Entrada del parser `pdfParser.ts` → importación de vuelos
- **Cat. B**: Plantilla de referencia para generación de Declaraciones Generales en v0.3
- **Cat. C**: Entrada del parser `excelParser.ts` → importación de extras/servicios

---

## Fase v0.3 — Documentación, validación de pasajeros y objetos olvidados

**Objetivo**: Generar documentación oficial, validar datos de pasajeros/tripulación, y gestionar objetos olvidados — todo integrado en las tarjetas de vuelo existentes, sin añadir páginas nuevas.

### v0.3.1 — Exportación de vuelos individuales

Accesible desde un botón/menú en cada FlightCard expandida.

#### PDF individual por vuelo
- Genera un PDF que replica el layout exacto de la Declaración General escaneada (Cat. B)
- Rellena automáticamente: indicativo, matrícula, origen/destino, fecha, parking
- Incluye datos de tripulación: nombre, fecha nacimiento, pasaporte, nacionalidad
- Incluye datos de pasajeros: nombre, nacionalidad, pasaporte
- Campo de firma del agente (en blanco para firmar a mano)
- Formato idéntico al original de AENA para aceptación oficial

#### Excel individual por vuelo
- Una hoja limpia con los datos del vuelo en formato tabular
- Secciones: datos del vuelo, tripulación (tabla), pasajeros (tabla), servicios (tabla)
- Formato one-page, imprimible

### v0.3.2 — Exportación masiva diaria

Accesible desde el menú de exportación existente en la cabecera del dashboard (`DaySummary`).

#### PDF diario multi-página
- Un documento PDF con una página por vuelo del día
- Cada página usa la misma plantilla de Declaración General (idéntica a v0.3.1)
- Solo cambian los datos: pasajeros, tripulación, fechas, pasaportes
- Portada opcional con resumen del día (total vuelos, total pax, total crew)

#### Excel diario
- Un archivo Excel con todos los vuelos del día
- Columnas limpias: indicativo, matrícula, tipo, origen, ETA, destino, ETD, parking, crew, pax, estado, servicios
- Hoja adicional con desglose de servicios por vuelo
- Formato listo para facturación o reporting

### v0.3.3 — Validación de pasajeros y tripulación

Accesible desde la sección de pasajeros/tripulación en la FlightCard expandida (modal o popover).

#### Lista detallada de pasajeros
- Modal que muestra la lista completa de pasajeros del vuelo
- Campos por pasajero: nombre completo, género, nacionalidad, número de pasaporte, fecha nacimiento
- Origen de datos: entrada manual o importado desde Declaración General escaneada (Cat. B)

#### Verificación contra documentos escaneados
- Comparación visual: el modal muestra los datos introducidos junto al extracto del PDF escaneado
- Posibilidad de marcar discrepancias (nombre incorrecto, pasaporte no legible, etc.)

#### Gestión de incidencias
- Marcar pasajero como **no-show** (no se presentó)
- Añadir pasajero de última hora (no aparecía en la lista original)
- Marcar correcciones en datos de pasaporte (dato original → dato corregido)
- Confirmación de género (para cumplir requisitos de declaración)
- Cada acción genera entrada en el EventLog del vuelo

### v0.3.4 — Objetos olvidados (Lost & Found por vuelo)

Accesible desde una nueva sección colapsable dentro de la FlightCard expandida, entre Servicios y el Log.

#### Registro de objetos
- Formulario inline (mismo patrón que AddServiceRow): descripción del objeto + localización donde se encontró
- Campos: descripción libre, ubicación (avión, sala, pista), fecha/hora de hallazgo (auto)
- Cada objeto registrado genera entrada en EventLog

#### Estado de recuperación
- Estados: `ENCONTRADO` → `RECLAMADO` → `ENTREGADO`
- Timestamp automático en cada transición
- Indicador visual en la tarjeta colapsada si hay objetos pendientes de recoger

### v0.3.5 — Generación de Declaraciones Generales en blanco

Accesible desde el menú de exportación en la cabecera o desde cada FlightCard.

- Genera un PDF vacío con la plantilla exacta de la Declaración General de AENA
- Pre-rellena solo los datos del vuelo (indicativo, matrícula, origen/destino, fecha)
- Los campos de pasajeros y tripulación quedan en blanco para rellenar a mano
- Útil para imprimir formularios limpios antes de la operación

---

### Puntos de integración con el dashboard existente

Todas las funcionalidades de v0.3 se integran dentro de las tarjetas de vuelo y la cabecera existentes:

```
┌─────────────────────────────────────────────────────────────┐
│  DaySummary (cabecera)                                      │
│  [Exportar ▾]  ← v0.3.2: PDF diario, Excel diario,        │
│                  v0.3.5: Declaración en blanco              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  FlightCard (colapsada)                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ 🔵 EC-MXQ · CRJ2 · VJT630 · P232                  │    │
│  │ [badges servicios] [⚠ 1 objeto pendiente]           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  FlightCard (expandida) — 3 columnas existentes             │
│  ┌──────────┬──────────────────────┬──────────┐             │
│  │ LLEGADA  │ ESTADO / DATOS       │ SALIDA   │             │
│  │          │ Combustible          │          │             │
│  │ Crew ← [modal pax v0.3.3]      │ Crew     │             │
│  │ Pax  ← [modal pax v0.3.3]      │ Pax      │             │
│  │          │ Toilet               │          │             │
│  │          │ Servicios            │          │             │
│  │          │ Objetos olvidados    │ ← v0.3.4 │             │
│  │          │ [📄 PDF] [📊 Excel] │ ← v0.3.1 │             │
│  │          │ Log de eventos       │          │             │
│  └──────────┴──────────────────────┴──────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Modelo de datos (nuevas tablas/campos para v0.3)

#### Tabla: Passenger (nueva)
- `id` (cuid), `flightId` (FK → Flight)
- `direction`: `ARRIVAL` | `DEPARTURE`
- `fullName`, `gender` (`M` | `F`), `nationality`, `passportNumber`, `dateOfBirth`
- `status`: `CONFIRMED` | `NO_SHOW` | `ADDED` (añadido de última hora)
- `corrections`: texto libre (si se corrigió algún dato)
- `verified`: boolean (validado contra documento escaneado)
- `createdAt`, `updatedAt`

#### Tabla: CrewMember (nueva)
- `id` (cuid), `flightId` (FK → Flight)
- `direction`: `ARRIVAL` | `DEPARTURE`
- `fullName`, `nationality`, `passportNumber`, `dateOfBirth`
- `role`: `CAPTAIN` | `FIRST_OFFICER` | `CABIN_CREW` | `OTHER`
- `createdAt`, `updatedAt`

#### Tabla: LostItem (nueva)
- `id` (cuid), `flightId` (FK → Flight)
- `description`, `location` (`AIRCRAFT` | `LOUNGE` | `RAMP`)
- `state`: `FOUND` → `CLAIMED` → `DELIVERED`
- `foundAt` (auto), `claimedAt`, `deliveredAt`
- `claimedBy`: texto libre (nombre de quien lo reclama)
- `createdAt`

---

## Decisiones de diseño

1. **Un vuelo = una fila** que agrupa llegada y salida (no separar como en la hoja de papel). La matrícula es siempre la misma para llegada y salida.
2. **Crew y pax pueden cambiar** entre llegada y salida en cualquier momento. El sistema debe permitir editar estos números fácilmente.
3. **Extras con tipos predefinidos + comodín**. Los predefinidos tienen icono fijo; el comodín permite nombre libre.
4. **Todo cambio genera un registro en el log** con timestamp y usuario que lo hizo.
5. **Diseño PC-first** pero con arquitectura que permita responsive futuro.
6. **La fuente de verdad es esta plataforma**, no Cybermax. Cybermax solo se usa para importar la hoja inicial del día.
