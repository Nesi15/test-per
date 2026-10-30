# Test PER

Web para practicar los tests del examen de **Patrón de Embarcaciones de Recreo (PER)** desde el móvil.
Está hecha con HTML, CSS y JavaScript puro, sin frameworks ni servidor, y funciona sin conexión.

- **Modos:** por tema (uno o varios), aleatorio, repasar falladas y simulacro con el formato oficial.
- **Corrección al momento:** verde o rojo, la respuesta correcta y una justificación con su fuente.
- **Guardado continuo:** el progreso se guarda en el navegador tras cada respuesta. Si cierras a mitad de un test, al volver aparece «Continuar donde lo dejaste».
- **Vueltas sin repetir:** no se repiten preguntas hasta haber visto todas las del tema. Al empezar una vuelta nueva salen primero las falladas.
- **Repasar falladas:** una pregunta sale de la lista cuando la aciertas 2 veces seguidas.
- **Copia de seguridad:** el progreso se puede exportar e importar (archivo o código) y reiniciar.

## Estructura

```
index.html             Página única
styles.css             Estilos (pensados para móvil, con modo oscuro)
app.js                 Lógica de la app
sw.js                  Service worker (uso sin conexión)
manifest.webmanifest   Datos para instalarla en la pantalla de inicio
preguntas.json         Banco de preguntas y formato del examen
icons/                 Iconos de la app
img/                   Imágenes de las preguntas (si las hay)
```

## Formato de `preguntas.json`

```json
{
  "version": 1,
  "temas":   { "1": "Nomenclatura náutica", "11": "Carta de navegación" },
  "examen":  { "preguntas": 45, "duracion_min": 90, "aciertos_min": 32,
               "bloques": [ { "tema": 6, "n": 10, "max_fallos": 5 } ] },
  "preguntas": [
    {
      "id": "t01-001",
      "tema": 1,
      "enunciado": "¿Qué es el asiento?",
      "opciones": ["…", "…", "…", "…"],
      "correcta": 0,
      "justificacion": "Máximo 3 líneas explicando por qué.",
      "fuente": "Unidad 1 Nomenclatura Náutica 1.pdf, pág. 10",
      "imagen": "img/t05-012.png",
      "verificada": true,
      "origen": ["1. Examen Nomenclatura Náutica 1.pdf nº 1"],
      "duda": "Opcional: aviso si la clave del examen es discutible"
    }
  ]
}
```

- `correcta` es el índice (empezando en 0) de la opción correcta dentro de `opciones`.
- `tambien_correctas` es opcional: lista de otros índices que también se dan por buenos (por ejemplo `[3]` en una pregunta ambigua).
- `imagen` es opcional. Pon el archivo en `img/` y escribe la ruta relativa.
- `verificada: false` indica que la respuesta se dedujo del temario porque el examen no traía solución.
- Las opciones se barajan solas. «Todas/Ninguna de las anteriores» se queda en su sitio, y las preguntas con opciones tipo «a y b son correctas» no se barajan.

## Cómo añadir temas nuevos (sin perder el progreso)

El progreso se guarda **por `id` de pregunta**. Mientras no cambies los `id` existentes, nadie pierde nada.

1. Añade el nombre del tema en `"temas"` si no está (p. ej. `"11": "Carta de navegación"`).
2. Añade las preguntas nuevas al final de `"preguntas"`, con `id` nuevos que sigan la numeración del tema: `t11-001`, `t11-002`… Si amplías un tema que ya existe, continúa por el último número (p. ej. después de `t05-045` va `t05-046`).
3. **Nunca** renumeres ni reutilices un `id` existente. Si quieres quitar una pregunta, bórrala: su `id` se ignora sin más.
4. Comprueba que el JSON es válido (por ejemplo, en <https://jsonlint.com>).
5. Sube el archivo a GitHub (ver más abajo). La próxima vez que abras la web con conexión verás las preguntas nuevas.

**Simulacro.** `examen.bloques` ya incluye los 11 bloques oficiales. Un bloque solo entra en el simulacro cuando su tema tiene al menos `n` preguntas. Mientras falte alguno, el examen se adapta: menos preguntas y tiempo y fallos máximos proporcionales. Con los 11 temas pasa a ser el oficial: 45 preguntas, 90 min y 32 aciertos.

**Si cambias el código** (`index.html`, `app.js`, `styles.css`…), sube el número de `CACHE` en `sw.js` (`test-per-v1` → `test-per-v2`) para que los móviles descarguen la versión nueva. Si solo cambias `preguntas.json`, no hace falta.

## Formato oficial del examen

Son 45 preguntas tipo test con 4 opciones y una sola válida, y 90 minutos. Es apto quien acierta 32 o más, sin superar 5 fallos en RIPA, 2 en Balizamiento y 2 en Carta de navegación. Reparto por unidad: 4-2-4-2-5-10-2-3-4-5-4 (unidades 1 a 11).
Fuente: RD 875/2014, Anexo II, y el modelo de examen PER de la Junta de Andalucía (22/03/2025). Las bases concretas pueden variar ligeramente según la comunidad autónoma.

## Publicar en GitHub Pages, paso a paso

**Sube solo el contenido de esta carpeta `web/`**, nunca los PDF del temario.

### Opción A: desde la web de GitHub (sin instalar nada)

1. Entra en <https://github.com> e inicia sesión (o crea una cuenta).
2. Pulsa **New repository** (botón «+» arriba a la derecha).
3. Ponle un nombre, por ejemplo `test-per`, márcalo como **Public** y pulsa **Create repository**.
4. En la página del repositorio vacío pulsa **uploading an existing file**.
5. Arrastra **todo el contenido** de la carpeta `web/` (los archivos y las carpetas `icons` e `img`, no la carpeta `web` en sí) y pulsa **Commit changes**.
6. Ve a **Settings → Pages**.
7. En **Build and deployment → Source** elige **Deploy from a branch**. En **Branch** elige `main` y la carpeta `/ (root)`, y pulsa **Save**.
8. Espera uno o dos minutos y recarga la página: aparecerá la dirección, del tipo `https://TU-USUARIO.github.io/test-per/`.

### Opción B: con Git desde el ordenador

```bash
cd web
git init
git add .
git commit -m "Test PER"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/test-per.git
git push -u origin main
```

Después, activa Pages como en los pasos 6 a 8.

### Actualizar más adelante

Edita o sustituye el archivo en GitHub (**Add file → Upload files**, o el lápiz para editar) y confirma con **Commit changes**. GitHub Pages se actualiza solo en uno o dos minutos.

## Instalar en el móvil

- **Android (Chrome):** abre la dirección, entra en el menú ⋮ y pulsa **Instalar aplicación** o **Añadir a pantalla de inicio**.
- **iPhone (Safari):** abre la dirección, pulsa Compartir y luego **Añadir a pantalla de inicio**.

Una vez abierta con conexión, funciona sin internet.

## Copia de seguridad del progreso

El progreso vive en el navegador de cada dispositivo. Para cambiar de móvil o de navegador:
**Mi progreso → Exportar a archivo** (o **Copiar código de progreso**), y en el otro dispositivo **Importar desde archivo** (o **Pegar código de progreso**).
Ojo: si borras los datos del navegador, también se borra el progreso. Exporta de vez en cuando.

## Probar en local

El service worker necesita un servidor (no funciona abriendo `index.html` con doble clic):

```bash
python -m http.server 8000
```

Después abre <http://localhost:8000>.
