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

## Decisiones de diseño

1. **Un vuelo = una fila** que agrupa llegada y salida (no separar como en la hoja de papel). La matrícula es siempre la misma para llegada y salida.
2. **Crew y pax pueden cambiar** entre llegada y salida en cualquier momento. El sistema debe permitir editar estos números fácilmente.
3. **Extras con tipos predefinidos + comodín**. Los predefinidos tienen icono fijo; el comodín permite nombre libre.
4. **Todo cambio genera un registro en el log** con timestamp y usuario que lo hizo.
5. **Diseño PC-first** pero con arquitectura que permita responsive futuro.
6. **La fuente de verdad es esta plataforma**, no Cybermax. Cybermax solo se usa para importar la hoja inicial del día.
