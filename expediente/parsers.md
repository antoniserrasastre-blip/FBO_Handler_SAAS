# Parsers de Importación — FBO Handler SaaS

## 1. PDF Cybermax — `src/lib/pdfParserV2.ts`

Fuente de verdad para vuelos. V1 eliminado.

**Técnica**: parsing por coordenadas X,Y (no por texto plano). El PDF de Cybermax tiene una estructura de columnas fija; el parser extrae el valor según la posición en la página, no por nombre de campo.

**Salida**: array de objetos con:
- `registration` (matrícula)
- `operatorIcao` (código ICAO operador)
- `callsign`
- `direction` (ARRIVAL | DEPARTURE)
- `eta`/`etd` (HH:MM Zulu)
- `paxCount`, `crewCount`
- `origin`/`destination` (código ICAO aeropuerto)

**Manejo de errores**: si una celda no se puede parsear, el campo queda `null` (no lanza excepción). El upsert posterior ignora nulls y no sobreescribe datos existentes.

## 2. Excel Mallorcair — `src/lib/excelParser.ts`

Fuente de servicios (extras). Se cruza con vuelos por **Matrícula**.

**Técnica**: 
- Columna A: matrícula (registro) → key de cruce
- Columna B: descripción del servicio
- Columnas E-G: cantidades (catering, otros)
- Prefijos de 2 chars y 1 char identifican el tipo de servicio

**Salida**: `ServiceInput[]` agrupados por matrícula.

**Manejo de órfanos**: si la matrícula no tiene Visit aún (el PDF no se ha importado), se crea una `Visit huérfana` que se enriquece cuando llega el PDF.

## 3. GENDEC — `src/lib/gendecParser.ts`

Parser del formulario de declaración general de pasajeros (pegado como texto).

**Técnica**: regex sobre texto libre del formulario GENDEC estándar ICAO.

**Salida**: `Passenger[]` con nombre, nacionalidad, tipo documento, número.

**Activación**: `POST /api/flights/[id]/gendec/extract` — el usuario pega el texto del GENDEC en un modal y el sistema extrae los pasajeros.

## 4. NetJets ALS PDF — `pdf-microservice/`

Microservicio Express separado, accesible vía Cloudflare Tunnel.

**Técnica**: extrae tabla de pasajeros + crew del PDF de NetJets Aircraft Level Security.

**Salida**:
- `Passenger[]`: nombre completo, pasaporte, DoB, nacionalidad (se encriptan al llegar)
- `CrewMember[]`: nombre, pasaporte, DoB, rol (CAPTAIN, FIRST_OFFICER, CABIN_CREW)

**Flujo**: el cliente llama al microservicio → éste devuelve JSON → el cliente llama a `POST /api/import/netjets-pax` con ese JSON → se persiste encriptado.

## 5. Validación de uploads — `src/lib/uploadValidation.ts`

Validación de tipo MIME y tamaño antes de pasar el fichero al parser.
- PDF: max 10MB, mime `application/pdf`
- Excel: max 5MB, mime `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

## Notas generales

- Ningún parser inventa datos. Si algo no está claro en el documento, el campo queda `null`.
- Los parsers son deterministas: mismo input → mismo output. No usan LLM ni heurísticas variables.
- Los upserts posteriores son idempotentes: reimportar el mismo PDF no duplica vuelos.
