# CHANGELOG.md

> Registro de versiones entregadas, escrito por el Director en
> voz operativa — lo lee MALLORCAIR, no lo lee un ingeniero.
> Una entrada por versión (no por commit). Fecha de release,
> no de empiece.
>
> Para el detalle técnico, `git log` y `ROADMAP.md`.

---

## v0.4 — Pegar GenDec en vez de teclear (2026-05-12)

**Qué ve distinto el handler**: en el modal de Tripulación/Pasajeros de cada
vuelo aparece un panel ámbar "Pegar GenDec". Pegas el texto del email
(o copias del PDF que llega de las aerolíneas y pegas), pulsas **Extraer**,
y sale una tabla con todos los nombres, pasaportes, nacionalidades y
fechas de nacimiento ya separados. Revisas, corriges si hace falta, y
"Añadir 7 entradas" → todos guardados de golpe.

**Qué se puede hacer que antes no**:

- Convertir un email de manifiesto en 7-15 personas guardadas en < 30
  segundos, sin teclear nada (vs ~5 min antes).
- Las nacionalidades en cualquier idioma (ESP/Spain/spanish/española/...)
  se reconocen y se normalizan a código ISO de 3 letras.
- Las fechas en cualquier formato europeo (DD/MM/YYYY, DD.MM.YY,
  21 May 1985, 21 abr 85) se normalizan a DD/MM/YYYY.
- Las filas con baja confianza salen marcadas en amarillo para revisar.
- Los roles de tripulación (CAPITÁN / F/O / FA / PIC / SIC) se detectan
  y se pre-rellenan.

**Cómo funciona por dentro**: parser determinista en JS — regex + tabla
de nacionalidades. **Nada sale del container**, los datos de pasaporte
no viajan a ninguna API externa. Si el email viene en un formato muy
raro y el parser no lo entiende, simplemente añade manualmente como
hasta ahora — el panel viejo sigue ahí.

**Bonus**: el PDF GenDec ya existente (`/api/export/blank-declaration`
y exportación por vuelo) sale ahora **relleno** automáticamente, sin
cambiar nada del template. Lo único que faltaba eran los datos en la DB.

**Limitaciones conocidas**:

- PDFs escaneados (imagen): hay que abrirlos, seleccionar texto, copiar,
  pegar. Si el PDF es solo imagen, no hay texto que pegar — eso lo
  resolvemos más adelante con OCR si os hace falta.
- Para los manifiestos de NetJets (formato muy específico), ya existe un
  parser dedicado en `pdf-microservice/` pero no está conectado todavía.

---

## v0.3 (POC) — Seguimiento en vivo de vuelos (2026-05-11)

**Qué ve distinto el handler**: en cada tarjeta de vuelo aparece
una etiqueta nueva en vivo: **Aproximación** (azul, parpadea),
**Aterrizado** (ámbar, parpadea), **En parking** (verde) o
**Despegado** (gris). La etiqueta sale sola cuando el avión real
entra en el radar ADS-B de Palma, sin que nadie haga nada.

**Qué se puede hacer que antes no**:

- Saber sin llamar a torre si el vuelo X ya está acercándose,
  ya ha aterrizado o ya está en parking. La info la da el
  propio avión (ADS-B), no AENA ni Cybermax.
- Cuando un vuelo pasa a "En parking" el equipo lo ve en la
  pantalla en directo y puede empezar la operación.

**Cómo funciona por dentro**: un proceso en el servidor pregunta
cada 30 segundos a OpenSky Network (red abierta de receptores
ADS-B) qué aviones hay en un radio de ~80 NM alrededor de LEPA.
Los cruza con los vuelos del día por **callsign** y actualiza la
fase. Coste: 0€. Requiere que el avión emita ADS-B (todos los
comerciales lo hacen). Si OpenSky no tiene cobertura del avión,
la etiqueta no aparece (no rompe nada).

**Limitaciones conocidas (POC)**:

- El "parking" se detecta como "avión en suelo y parado", no
  por polígono de stand. Mejorable cuando tengamos las
  coordenadas oficiales de cada stand de Palma.
- Vuelos privados con transpondedor apagado o sin ADS-B no
  aparecen.
- Si OpenSky cae, no hay datos hasta que vuelva (sin coste de
  API alternativa).

**Vía oficial paralela**: en paralelo se solicitará a AENA
acceso A-CDM/AODB como handler licenciado. Cuando llegue, se
sustituye la fuente sin tocar el frontend.

---

## v0.2 — Panel de operaciones (2026-04-20)

**Qué ve distinto el handler**: abre el panel, ve la lista de
vuelos del día como tarjetas de colores, y puede cambiar estado
(esperado → en rampa → embarque → despachado) con un clic.
Cuando llega un PDF de Cybermax, lo sube y aparecen los vuelos
en la lista — deja de haber transcripción a mano.

**Qué se puede hacer que antes no**:

- Subir el PDF del día y tener los vuelos en el panel en
  < 30 segundos. Overnight flights aparecen en los dos días
  correctos.
- Subir la Hoja de Extras (Excel) y ver los servicios asociados
  a cada vuelo por matrícula.
- Marcar servicios (catering, hielo, thermos...) como pendiente
  / llegado / entregado. Cada cambio queda con timestamp.
- Cambiar el estado del vuelo con un clic. El cambio lo ve el
  resto del equipo sin refrescar.
- Tres roles: admin (Antoni), handler (turno), viewer (lectura).
- Exportar el día a CSV.
- Consultar días anteriores en el histórico.
- Instalar la página como app en el móvil (PWA).
- Ver conflicto de parking si dos vuelos coinciden en el mismo
  stand (registro oficial del AIP).

**Qué no hace todavía, y cuándo llega**:

- Vista densa tipo "Orden del día digital" (`/dia`). Próxima.
- Control de equipaje con etiquetas Dymo. En v0.3.
- Timeline Gantt. En v0.3 o v0.4.
- Sección Ayuda con el Manual de Filtro. Spec firmada, próxima.

**Riesgo editorial vivo**: la sincronía real es SSE en memoria —
funciona con una instancia de Vercel. Con dos instancias no
sincroniza. El salto a WebSocket + Redis queda en el ROADMAP.
Si el equipo crece a >5 conexiones simultáneas antes de ese
salto, vemos fricción.

---

## Plantilla para próximas entradas

```
## vX.Y — Titulo corto (YYYY-MM-DD)

**Qué ve distinto el handler**: 2-3 líneas en primera persona.

**Qué se puede hacer que antes no**: lista de capacidades
nuevas con una línea cada una.

**Qué no hace todavía, y cuándo llega**: lista de ausencias
conocidas con fase de ROADMAP que las cubre.

**Riesgo editorial vivo**: 1-2 líneas sobre el mayor riesgo
abierto y cuándo toca mitigarlo.

**Decisiones firmadas que impactan esta versión**:
- #N · Título — efecto en una línea.
```

---

## Reglas de escritura de CHANGELOG (para el Director)

1. **Una versión, una entrada**. Commits van en `git log`.
2. **"Qué ve distinto el handler" primero**. Si no ve nada
   distinto (sprint estructural), decirlo literal:
   *"v0.X.Y — refactor interno. El handler no ve diferencia
   hoy; habilita el v0.X+1 que entrega [...]"*. No disimular.
3. **Sin lenguaje técnico en la sección del handler**. Nada de
   "Prisma", "SSE", "TypeScript" en esa sección. Ese vocabulario
   vive en "Riesgo editorial vivo" si hace falta.
4. **Fecha de release**, no de sprint.
5. **Las decisiones firmadas que impactaron la versión se
   enlazan al final** con su número de `DECISIONS-PENDING.md`.
6. **Máx 400 palabras por entrada**. Si no cabe, la versión era
   demasiado grande y toca retrospectiva.
