# Spec — Sección de Ayuda (Manual de Filtro)

## Objetivo

Añadir una sección de ayuda dentro de la app que muestre el contenido del
documento `docs/MANUAL FILTRO 2026.pdf` estructurado y buscable, para que el
personal de filtro pueda consultarlo en turno sin abrir el PDF.

**Fuente de verdad:** `docs/MANUAL FILTRO 2026.pdf` (21 páginas). El contenido
se transcribe una vez a TypeScript; el PDF queda como referencia histórica.

## Prioridades

1. **Apertura** (turno mañana) — crítico para el primer uso, debe quedar
   destacado y abierto por defecto.
2. Resto de secciones (Sandwich, Cierre, Hojas Maletas, Conducta, Uniformidad,
   Atención Cliente, Atención Tripulación, Equipaje, Transporte, Coche,
   Catering, Vajillas, Extras, Policía/Guardia Civil, Llegadas, Salidas/Trablisa,
   Filtro-Oficina, Crossroads, Gendecs, NetJets, TimeAir).

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

Callouts obligatorios (tone `danger` o `warning`):

- Equipaje bodega abierta → no enviar maletas sin pax.
- Vajillas sucias → nunca en almacén.
- Armas → documentación a Guardia Civil, pistero entra con el pax.
- Copiar-pegar VJH / VJT / NetJets → formato "extraño", casilla por casilla.
- Móvil sin permiso → no permitido.

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
