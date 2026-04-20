# Spec — Sección de Ayuda (Manual de Filtro)

## Objetivo

Añadir una sección de ayuda dentro de la app que agregue el contenido de los
documentos operativos de MALLORCAIR en una vista estructurada y buscable, para
que el personal de filtro pueda consultarlos en turno sin abrir PDFs sueltos.

**Fuentes de verdad** (en `docs/`):

| Documento | Uso en la app |
|-----------|---------------|
| `MANUAL FILTRO 2026.pdf` | Grueso del contenido (22 secciones operativas) |
| `PROCEDIMIENTO OPERATIVO PASO A PASO SOP_EQUIPAJE CONTROLADO ESP.pdf` | Sección propia `sop-equipaje` (procedimiento formal MLR-OPS-BAG-01 V1.00) |
| `Hoja_Control_Equipaje_Bodega_Mallorcair ESP.pdf` + `Hold_Baggage_Control_Sheet_Mallorcair ENG.pdf` | Referencia dentro de `sop-equipaje` — mostrar estructura de la hoja (Fecha / Nº Vuelo / Destino / Matrícula / Total bultos / Filtro parcial-final / Pista parcial-final / firmas) |
| `Condiciones de uso aparcamiento abonados PMI.pdf` | Sección propia `aparcamiento-pmi` (15 normas Aena) |

El contenido se transcribe una vez a TypeScript; los PDFs quedan como
referencia histórica. No se parsean en runtime.

**Fuera del alcance del help (aunque estén en `docs/`):**

- `FORMATO INFORMACIÓN MALLORCAIR.doc` — formulario PRL (se rellena por
  empleado, no es contenido de consulta operativa).
- `image002.png` — activo gráfico embebido, no documento.
- Daily PDFs / Excels de extras — inputs de parser, no documentación.

## Prioridades

1. **Apertura** (turno mañana) — crítico para el primer uso, destacado y
   abierto por defecto.
2. **SOP Equipaje Controlado** — procedimiento formal con firmas obligatorias;
   la gente lo consulta en cada salida con pax.
3. Resto de secciones (Sandwich, Cierre, Hojas Maletas, Conducta, Uniformidad,
   Atención Cliente, Atención Tripulación, Equipaje, Transporte, Coche,
   Catering, Vajillas, Extras, Policía/Guardia Civil, Llegadas, Salidas/Trablisa,
   Filtro-Oficina, Crossroads, Gendecs, NetJets, TimeAir, Aparcamiento PMI).

## Archivos a crear

| Ruta | Responsabilidad |
|------|-----------------|
| `src/app/ayuda/page.tsx` | Página `/ayuda`. Renderiza secciones colapsables + buscador. Client component. |
| `src/lib/manualContent.ts` | Datos tipados del manual (una constante `MANUAL_SECTIONS`). Sin JSX, sin React. |

Modificar:

| Ruta | Cambio |
|------|--------|
| `src/components/DaySummary.tsx` | Añadir botón "Ayuda" junto a `Historico` / `Metricas` que navegue a `/ayuda`. Visible en móvil también (a diferencia de los otros, que son `hidden sm:block`). |

No crear nada más. No tocar schema, auth, ni API.

## Modelo de datos (`src/lib/manualContent.ts`)

```ts
export type ManualBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; tone: "info" | "warning" | "danger"; text: string };

export interface ManualSection {
  id: string;          // slug estable, ej. "apertura"
  title: string;       // "Apertura"
  subtitle?: string;   // "06:00-14:00 / 07:00-15:00"
  icon: string;        // key del ICON_MAP en page.tsx
  highlight?: boolean; // true solo para "apertura"
  blocks: ManualBlock[];
}

export const MANUAL_SECTIONS: ManualSection[] = [...];
```

## Contenido (secciones mínimas y origen en el PDF)

Cada sección traduce lo que aparece en el PDF. Mantener textos en español,
sin inventar ni resumir en exceso — son instrucciones operativas.

| id | title | origen PDF | notas |
|----|-------|------------|-------|
| `funciones` | Funciones generales | p.2 | Intro: daily + hoja extras + walkie |
| `apertura` | Apertura | p.2 | `highlight: true`. subtitle horarios |
| `sandwich` | Sandwich | p.2-3 | |
| `cierre` | Cierre | p.3 | Incluir mails (Guardia Civil, Fronteras, Residuos) |
| `hojas-maletas` | Hojas maletas | p.4 | |
| `conducta` | Manual de conducta | p.4 | |
| `uniformidad` | Uniformidad | p.4-5 | |
| `atencion-cliente` | Atención al cliente | p.5 | Incluir frases en inglés literales |
| `atencion-tripulacion` | Atención a tripulación | p.5-6 | Con/sin pax |
| `equipaje` | Equipaje | p.6 | Bodega abierta (PC12/BE20/B350/TBM) como callout |
| `transporte` | Transporte | p.7 | |
| `coche` | Coche alquilado o privado | p.7 | |
| `catering` | Catering | p.7-9 | Pedidos Netjets: cuidado con numeración |
| `vajillas` | Vajillas | p.9-10 | Callout: vajillas sucias nunca en almacén |
| `extras` | Extras | p.10-11 | |
| `policia-gc` | Policía Nacional / Guardia Civil | p.11 | Armas como callout |
| `llegadas` | Llegadas | p.11 | |
| `salidas-trablisa` | Paso por filtro / Trablisa (salidas) | p.11-12 | |
| `filtro-oficina` | Filtro-Oficina | p.12 | |
| `crossroads` | Crossroads | p.13-14 | URL: suppliers.netjets.com/... |
| `gendecs` | Gendecs | p.15-19 | Sección larga, dividir en sub-headings |
| `netjets` | NetJets | p.20 | Ojo con ID alemanes |
| `timeair` | TimeAir / TIE | p.21 | Flujo click here → download |
| `sop-equipaje` | SOP Equipaje Controlado | `SOP_EQUIPAJE CONTROLADO ESP.pdf` | `highlight: true` (2ª prioridad). Fases Filtro (parcial/final) + Pista (parcial/final), cambios última hora, total final, registro en Cyber, 3 firmas obligatorias, 4 normas fundamentales. subtitle: "MLR-OPS-BAG-01 V1.00" |
| `hojas-control-equipaje` | Hojas de control de equipaje (plantilla) | `Hoja_Control_Equipaje_Bodega_Mallorcair ESP.pdf` + `Hold_Baggage_Control_Sheet_Mallorcair ENG.pdf` | Sub-sección dentro de `sop-equipaje` o independiente. Describe campos de la plantilla física: Fecha, Nº Vuelo, Destino, Matrícula, Total bultos, Filtro parcial/final, Pista parcial/final, Totales pista, 3 firmas (Filtro/Pista/Comandante) con nombre + hora |
| `aparcamiento-pmi` | Aparcamiento empleados PMI | `Condiciones de uso aparcamiento abonados PMI.pdf` | 15 normas Aena. Puntos clave: abono nominativo/personal/intransferible, jornada laboral solamente, estancia máx 2 días (7 para tripulaciones), un aeropuerto único, sanciones escaladas (3 meses → 6 meses → indefinido). Emails: `gestion-parking.pmi@easparking.com`, `pmi.com.aparcamientos@aena.es` |

Callouts obligatorios (tone `danger` o `warning`):

- Equipaje bodega abierta → no enviar maletas sin pax.
- Vajillas sucias → nunca en almacén.
- Armas → documentación a Guardia Civil, pistero entra con el pax.
- Copiar-pegar VJH / VJT / NetJets → formato "extraño", casilla por casilla.
- Móvil sin permiso → no permitido.
- SOP Equipaje: si filtro parcial ≠ filtro final → `danger` "detener proceso".
- SOP Equipaje: si pista final no coincide → `danger` "NO cargar".
- SOP Equipaje: no autorizar salida con discrepancias (norma fundamental).
- Aparcamiento PMI: abono nominativo e intransferible, sanciones progresivas.

## UI/UX

- Ruta `/ayuda` (protegida por el `middleware` existente, no hay que tocar nada).
- Header pegajoso con: botón `Volver` (→ `/`), título "Manual de Filtro" con
  icono `BookOpen` naranja, botones `Abrir todo` / `Cerrar`.
- Buscador que filtra secciones por título/contenido y resalta coincidencias
  con `<mark>`. Cuando hay query activa, todas las coincidentes se expanden.
- Cada sección es un `<section>` colapsable con icono Lucide, título, subtítulo
  opcional y badge "Turno apertura" (naranja) si `highlight`.
- Por defecto solo `apertura` está abierta.
- Estilo Tailwind, mobile-first, mismo tono visual que el resto de la app
  (grises + naranja para el acento del manual, que es el color corporativo del
  PDF).
- Sin emojis — solo Lucide (convención CLAUDE.md).

## Acceso desde la app

En `DaySummary.tsx`, añadir antes del botón `Historico`:

```tsx
<button
  onClick={() => router.push("/ayuda")}
  className="rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
  title="Manual de filtro"
>
  Ayuda
</button>
```

Visible en móvil y desktop (sin `hidden sm:block`): es lo que más se
consultará en turno desde el móvil.

## Criterios de aceptación

- [ ] `npm run build` pasa sin errores ni warnings de TS.
- [ ] `/ayuda` carga autenticado y redirige a `/login` si no lo está.
- [ ] Sección `apertura` aparece primero en el listado y abierta por defecto,
      con badge naranja.
- [ ] Buscar `gendec` resalta coincidencias y expande la sección Gendecs.
- [ ] Botón `Ayuda` aparece en el header del dashboard en móvil y desktop.
- [ ] Todas las secciones listadas arriba están presentes con su contenido
      transcrito del PDF.
- [ ] Callouts obligatorios visibles con el tono correcto.
- [ ] `sop-equipaje` aparece como 2ª sección destacada (después de Apertura)
      con badge propio y todas las fases/normas/firmas.
- [ ] `aparcamiento-pmi` incluye los emails de contacto como bloques de texto
      copiables (no hace falta link activo).

## Fuera de alcance

- No se parsea el PDF en tiempo de ejecución.
- No hay edición/CRUD del manual desde la UI (v1 es contenido estático).
- No hay versionado ni historial de cambios del manual.
- No se traduce al inglés.

## Convenciones CLAUDE.md aplicables

- UI en español, código/comentarios en inglés.
- Iconos Lucide, sin emojis.
- `@/*` → `src/*`.
- Componentes PascalCase, archivos TSX.
- TypeScript estricto.
- No añadir comentarios que describan qué hace el código; solo el porqué si
  es no obvio.
