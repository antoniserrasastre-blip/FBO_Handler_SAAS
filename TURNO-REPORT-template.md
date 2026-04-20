# turnos/TURNO-REPORT-YYYY-MM-DD.md

> Plantilla. Se copia a `turnos/TURNO-REPORT-YYYY-MM-DD.md` (fecha
> del turno, no de la escritura) y se rellena al cerrar turno o
> al día siguiente. Input primario del Director — equivale al
> "playtest" en project-civilization.
>
> **Lo rellena**: el handler que vivió el turno, o el humano
> observando el panel durante el turno. Si el rellenador no es
> el Director, al subir el fichero avisa al Director en la
> siguiente sesión.
>
> **Longitud objetivo**: 200-400 palabras. Si es más largo, hay
> que filtrar. Si es más corto, el turno fue aburrido — también
> vale la pena anotarlo.

---

## Contexto del turno

- **Fecha**: YYYY-MM-DD
- **Horario**: HH:MM – HH:MM
- **Puesto**: [rampa / oficina / despacho / remoto]
- **Vuelos del día**: N (X llegadas + Y salidas + Z overnight)
- **Versión del panel**: vX.Y (`git rev-parse --short HEAD` si se sabe)
- **Quién rellena**: [nombre]

---

## Perspectiva del handler — 4 momentos

### Apertura de turno (inicio)

*¿Cómo entraste al panel? ¿Qué viste? ¿Qué echaste de menos?*

- [escribir]

### Mitad del turno

*Momento más cargado. ¿Cómo respondió el panel? ¿Buscaste
algo que no encontraste?*

- [escribir]

### Imprevisto del día

*¿Hubo algo fuera de guion (vuelo que cambia de parking a
última hora, pax extra no previsto, avería, cierre de pista)?
¿Cómo lo gestionaste con el panel?*

- [escribir]

### Cierre de turno

*¿El panel te ayudó a pasar el testigo al turno siguiente? ¿O
tuviste que contarlo por radio/WhatsApp?*

- [escribir]

---

## Fricciones detectadas

Numerar. Una línea cada una. Clasificar:

- **[BUG]** algo no funciona como debería.
- **[UX]** funciona pero cuesta un clic de más / no se encuentra.
- **[FALTA]** algo que el handler esperaría y no está.
- **[OK]** algo que funcionó notablemente bien (anotar también —
  informa al Director de qué preservar).

Ejemplo:

```
1. [UX] Al marcar un extra como ENTREGADO, el checkbox no cambia
   visualmente hasta que refresco. Parece que no ha guardado.
2. [BUG] PDF del 13APR no parseó el vuelo overnight de las 23:50.
   Tuve que meter el vuelo a mano.
3. [FALTA] No encuentro dónde marcar que un pax se ha ido en taxi
   en vez de coche de alquiler. Tuve que dejarlo en "sin definir".
4. [OK] El alert de 2 FURGONETAS saltó solo con pax > 5. Útil.
```

---

## Momentos de "casi vuelvo al papel"

*El momento más honesto del reporte. ¿Cuándo estuviste a punto
de dejar el panel y volver a la hoja impresa? Si no pasó,
escribe "ninguno".*

- [escribir]

---

## Sugerencias del handler

*Propuestas del handler — no se implementan directamente, las
filtra el Director. Vale con idea suelta.*

- [escribir]

---

## Para el Director — qué mirar primero

*Rellenar solo si el handler o el humano tienen clara la
prioridad. El Director puede reinterpretar.*

- **Más urgente**: [número de fricción de la lista]
- **Bloquea el siguiente turno**: [sí / no]
- **Contacto posible si hay dudas**: [nombre / canal]
