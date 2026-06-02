# Parsers de Importación — FBO Handler SaaS

Esta hoja cubre **solo los tres parsers de importación** que viven en `src/lib/`.
El microservicio NetJets ALS, `uploadValidation` y los upserts se documentan en
otras hojas. El código es la única fuente de verdad.

---

## 1. PDF Cybermax — `src/lib/pdfParserV2.ts` (+ fachada `pdfParser.ts`)

Fuente de verdad para **vuelos**. Parsing por **coordenadas X,Y**, no por texto plano.

### Fachada `pdfParser.ts` (NO eliminada)

V1 no existe como parser propio, pero `pdfParser.ts` **sigue vivo** como fachada
delgada sobre V2. Todos los callers importan de `@/lib/pdfParser`, no de
`pdfParserV2` directamente. Responsabilidades de la fachada:

- `parseCybermaxPdf(buffer)` — llama a `parseV2` y **remapea** los nombres de
  campo de V2 a la forma legacy que esperan los callers (ver tabla abajo).
- **SAFE_MODE**: si `process.env.PDF_PARSER === "safe-mode"`, devuelve resultado
  vacío y loguea un warning — pausa las importaciones sin redeploy.
- `parseDate(ddmmyy)` — convierte `DD/MM/YY` a `Date` a medianoche **UTC**
  (pivote de siglo: `yy < 50` → 2000+, si no 1900+).
- Importa `./pdfPolyfills` por efecto secundario (parche de runtime para pdfjs).

### Motor `pdfParserV2.ts`

- Usa `pdfjs-dist/legacy/build/pdf` (CJS) vía `require`; `workerSrc = ''` activa
  el FakeWorker inline (sin Worker real).
- **`parseCybermaxPdf(buffer)`** (export principal del motor): itera páginas,
  extrae cada `text` con su `x = transform[4]`, `y = transform[5]`.
- **`parsePageItems(items, isFirstPage, pageNum)`**: lógica por página (exportada;
  es lo que testea `pdfParserV2.test.ts`).

#### Heurísticas no obvias

- **Anclas de columna** (`COLUMNS`) → rangos no solapados (`COLUMN_RANGES`):
  cada `x` cae en exactamente una columna vía `findColumn(x)`. Los rangos se
  recortaron en el punto medio entre anclas adyacentes para evitar que un
  desplazamiento de 1-2 px de Cybermax descartara datos en silencio.
- **Separadores absorbidos**: las columnas `crew_sep`, `pax_sep` (las `"/"`) y
  `loc` se mapean pero se descartan a propósito (no escriben campo).
- **Merge por Y**: filas cuyo `Y` difiere en ≤1 punto se fusionan (las filas de
  vuelo de Cybermax ocupan dos líneas físicas).
- **Detección de fecha de sheet**: en la primera página, primera celda con
  patrón `DD/MM/YY` por encima de `y >= 700`.
- **Filtro de filas**: se ancla en la celda de callsign de llegada (`x∈[18,35]`);
  se saltan cabeceras (`Vuelo|Origen|Avión|F.Prev|Hora|LLEGADAS|SALIDAS|…` +
  `FBO_HEADER`) y filas que empiezan por fecha.
- **`FBO_HEADER`**: cabecera de la empresa, configurable vía
  `process.env.FBO_COMPANY_NAME` (default `"FBO"`).
- **`detectFlightType(callsign, registration)`** → `FlightType`:
  - callsign empieza por `CAT` → `EXTERNAL_SERVICE`
  - `ZJONES` / reg `Z-JONES` / reg con `JONES` → `LOUNGE_GUEST`
  - resto → `HANDLING`
- Los `*` se eliminan de cada texto antes de asignar.

#### Salida — `ParseResult`

`{ sheetDate, flights: ParsedFlight[], errors: string[], warnings: ParseWarning[] }`

Cada `ParsedFlight` es **una fila llegada+salida combinada** (no se divide en
ARRIVAL/DEPARTURE aquí). Campos del motor V2:

```
callsign, origin, prevDate, arrTime,
registration, aircraft, parking,
crewArr, crewDep, paxArr, paxDep,
depCallsign, destination, depDate, depTime,
flightType
```

La fachada los renombra a la forma legacy `ParsedFlight` que consumen las rutas:
`callsign, origin, arrivalDate, eta, registration, aircraftType, parking,
crewArrival, crewDeparture, paxArrival, paxDeparture, departureCallsign,
destination, departureDate, etd`. Los conteos (`crew*`/`pax*`) se convierten a
`number` con `toInt` (no parseable → `0`); `arrivalDate`/`departureDate` caen a
`sheetDate` si la fila no traía fecha propia.

#### Errores y warnings (feedback al operador, no abortan)

- `errors`: fila con callsign pero sin matrícula; con matrícula pero sin
  callsign; con matrícula pero sin ETA ni ETD.
- `warnings` (`ParseWarning { row, reason }`): fila sin matrícula (no cruzable
  con Extras); items de texto fuera de toda columna (posible desplazamiento de
  layout). En multipágina, cada warning se prefija con `[pN]`.

#### Quién la consume

- `src/app/api/import/route.ts` — `POST` (preview + reconciliación de
  cancelaciones por matrícula contra Visits del día), `PUT` (persistencia).
- `src/lib/v2/resolveImportState.ts` y `src/app/api/import/route.ts` — `parseDate`.
- `src/app/import/page.tsx` — importa el tipo `ParsedFlight`.

---

## 2. Excel Mallorcair "Extras" — `src/lib/excelParser.ts`

Fuente de **servicios / extras**. Se cruza con vuelos por **matrícula**.

- **`parseExtrasExcel(buffer)`** → `ExcelParseResult { date, extras, errors }`.
  Lee la primera hoja con `xlsx` (`sheet_to_json` con `header: 1`).

### Estructura del Excel

- Cabecera (filas 0-1): `EXTRAS MALLORCAIR` + `FECHA: 13APR`.
- **Sección principal** (fila 2 hasta la sección especial): dos columnas lógicas.
  - Izquierda: `colA` = matrícula, `colB` = descripción.
  - Derecha: `colE` = matrícula, `colF` = descripción.
  - Líneas de continuación: `colB`/`colF` sin nueva matrícula → se acumulan en la
    última matrícula vista (`currentRegLeft`/`currentRegRight`).
- **Secciones especiales** (a partir de la fila que contiene `CATERING AIRE:`):
  - Catering Aire: `colA` = hora, `colB` = matrícula → servicio `CATERING`
    (`origin: "Catering Aire"`).
  - Catering NetJets: `colC` = hora, `colD` = referencia, `colE` = reg + `/P`|`/C`
    o sufijo de leg `/1`,`/2`. Genera `CATERING` (`origin: "NetJets"`) con
    `reference` y `target` PAX/CREW (los sufijos numéricos son legs, sin target).
    Filas con `SKYVALET` se saltan.
  - Prensa MCR / Relay: `colF` = matrícula, `colG` = títulos → `NEWSPAPERS`
    (`origin: "MCR"`). La prensa puede empezar ya en la sub-cabecera.

### Heurísticas de matrícula (lo importante del cruce)

- **`looksLikeRegistration(val)`**: descarta `FALSE_POSITIVES`
  (BARCELO, FECHA, VUELO, CATERING, PAX, CREW…); acepta si los 2 primeros chars
  están en `TWO_CHAR_PREFIXES`, o el primero en `ONE_CHAR_PREFIXES` (salvo `N`),
  o `N` seguido de dígito (matrículas US).
- **`isRegistration(val)`**: limpia sufijos (`/1`, `/2`, `/P`, `/C`, `*`,
  paréntesis, dígitos finales), exige patrón alfanumérico de 4-7 chars, rechaza
  números puros, y delega en `looksLikeRegistration`.
- **`insertDash(reg)`**: inserta el guión canónico según prefijo conocido
  (`9H` → `9H-…`, `EC` → `EC-…`, etc.). `N` (US) se deja sin guión. Es la clave
  para que la matrícula del Excel **case con la del PDF** en el cruce.
- **`cleanReg(val)`**: normaliza (quita `/P`,`/C`, sufijos, parámetros) y aplica
  `insertDash`. Es la forma final usada como key del mapa de extras.

### Categorización y deduplicación

- **`categorizeService(desc)`** → `ParsedService[]`: parte descripciones
  compuestas por `,` y por `+`; extrae cantidad (`2x …`, `01 …`, con guardas
  `NOT_QTY_NEXT` para KG/PAX/MIN/BAGS…); mapea por palabras clave a tipos
  `CATERING | DISHES | COOLER_BAG | STORAGE_BAG | LAUNDRY | THERMOS | NEWSPAPERS`,
  cae a `CUSTOM` si no encaja. Descarta matrículas filtradas y líneas `REG:`/
  `HORA:`/`VUELO:`.
- **`parseExcelDate(raw)`**: convierte `13APR`, `10ABR`, `5MAY`, `13APR26`… a
  `YYYY-MM-DD` (meses ES+EN en `MONTH_MAP`; sin año → año actual).
- **Deduplicación por leg**: cada entrada detallada de catering especial
  (NJE / Catering Aire) suprime **un** `CATERING` genérico de la sección principal
  (conteo por leg, no global) — preserva el segundo leg si solo el primero tiene
  NJE. Los no-CATERING se deduplican por clave exacta `tipo|nombre`.

### Errores

- Valores en `colA`/`colE` que no parecen matrícula → warning "se ha ignorado"
  (filtrando cabeceras vía `HEADER_HINTS`).
- Catering NetJets con referencia no parseable.
- Fecha no detectada → error (la ruta usará la fecha actual).

### Quién lo consume

- `src/app/api/import/extras/route.ts` — `POST` (parsea, preview) y `PUT`
  (agrupa por fecha, cruza con Visits del **palmaDay** por matrícula, crea
  servicios). El cruce usa `palmaDayUtc` + lookup de Visits por matrícula.

---

## 3. GenDec — `src/lib/gendecParser.ts` — APARCADO

> **Decisión de producto (2026-06-02): el flujo GenDec está aparcado.** El código
> está intacto y dormido, no se usa en el MVP actual y no se invierte más en él
> hasta nueva orden. Se documenta aquí como presente-pero-en-segundo-plano, no
> como flujo activo. (La exportación de declaración en blanco,
> `/api/export/blank-declaration`, es independiente y **sí** se usa.)

Parser de **texto libre** de General Declaration (crew + pasajeros pegados como
texto). Offline, sin LLM, sin red. Filosofía: permisivo, marca `confidence`,
nunca inventa campos (lo dudoso queda vacío para corregir en la preview).

- **`parseGenDecText(text)`** → `{ crew: ParsedPerson[], passengers: ParsedPerson[] }`.
  Trocea en bloques por líneas en blanco; detecta cabeceras de sección
  (`CREW_HEADER` / `PAX_HEADER`); por defecto clasifica como pasajeros.
- Modo **bloque** (`blockToPerson`): si ≥2 líneas son `Campo: valor`
  (`LABEL_LINE_RE` + `LABEL_MAP`), trata el bloque como una persona.
- Modo **línea** (`parsePersonLine`): cada línea = una persona; extrae y
  **descuenta** del texto fecha, pasaporte, nacionalidad y rol; lo que queda es
  el nombre.

#### Detectores exportados (y testeados)

- **`extractDate`**: soporta `DD/MM/YYYY`, ISO `YYYY-MM-DD`, y `12 ABR 2024`
  (meses ES+EN); heurística de swap DD↔MM y pivote de año de 2 dígitos (<30 →
  20XX) para DOBs.
- **`extractPassport`**: 6-12 alfanuméricos con al menos un dígito; excluye
  `NON_PASSPORT_WORDS`.
- **`extractNationality`**: tokeniza y consulta `lookupNationality`
  (`./nationalities`), probando frases de 2 palabras antes que palabras sueltas.
- **`extractRole`** → `CAPTAIN | FIRST_OFFICER | CABIN_CREW | OTHER` por patrones
  ES/EN (incluye PIC/SIC, FO, sobrecargo…).

#### Quién lo consume (rutas/UI dormidas)

- `src/app/api/flights/[id]/gendec/extract/route.ts` — `POST`: requiere writer,
  límite 200 KB, parsea y devuelve **preview** (no escribe en DB).
- UI: `src/components/GenDecPasteSection.tsx` (usada en `PassengerCrewModal` y en
  dos secciones de `/dia`). Importa el tipo `ParsedPerson`.

---

## Notas transversales reales

- **Zonas horarias** (regla de oro del proyecto): vuelos en **Zulu**, extras /
  catering en **Peninsular**; el cruce de extras agrupa por `palmaDay`.
- Ningún parser inventa datos: lo no extraíble queda vacío/`null`/`0`.
- Cobertura de tests: `pdfParserV2.test.ts`, `excelParser.test.ts` (fixtures
  gitignored → `describe.skipIf(!FIXTURES_AVAILABLE)`), `gendecParser.test.ts`.
