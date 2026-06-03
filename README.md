# RuRumin.ai

Herramienta de escritorio para **análisis temático exhaustivo** de transcripciones
de entrevistas (`.docx`). El cliente (Tauri + React + TypeScript) extrae el texto
en local y lo envía a un microservicio (FastAPI) que analiza el contenido en
múltiples capas (*layers*) usando la API de Gemini.

## Arquitectura

```
RuRumin.ai/
├─ backend/                 Microservicio FastAPI (Python 3.11)
│  ├─ app/
│  │  ├─ models.py          Contratos Pydantic (recursivos)
│  │  ├─ main.py            App FastAPI + CORS + manejo de errores
│  │  ├─ prompts.py         Prompts Gemini: por layer + Pass 0 estructural + fusión cruzada
│  │  ├─ llm_schema.py      Validación del JSON crudo del modelo (layer + Pass 0)
│  │  ├─ routers/analysis.py  POST /api/analyze-transcript(/stream) + /api/merge-projects/stream
│  │  └─ services/          analyzer (pirámide + Pass 0) + aggregation + merge (fusión) + mapping
│  ├─ requirements.txt
│  ├─ Dockerfile            Imagen para Google Cloud Run (puerto 8080)
│  └─ .dockerignore
├─ frontend/                Cliente Tauri + React + Vite
│  ├─ src/
│  │  ├─ types.ts           Interfaces TS (espejo 1:1 de Pydantic)
│  │  ├─ services/          apiClient + docxExtractor + quota (cuotas locales, IndexedDB)
│  │  ├─ components/        Home, ReaderSummary (toggle), TreeView, FusionView/FusionReader, modales
│  │  ├─ utils/             i18n, colors, layers, pyramid (config manual)
│  │  └─ data/              mockData + models (catálogo de modelos de IA)
│  ├─ src-tauri/            Proyecto Rust de Tauri (config + íconos)
│  └─ .env.example          VITE_API_BASE_URL
└─ .github/workflows/release.yml   CI: instalador Windows (Tauri v2)
```

El contrato de datos usa **snake_case** en ambos lados, por lo que el JSON es
idéntico entre Python y TypeScript (sin mapeo de alias).

## Requisitos

- **Python 3.11+** (backend)
- **Node.js 18+** (frontend)
- **Rust** vía `rustup` (solo para compilar la app nativa de Tauri)
- En Windows con WSL: ejecutar el frontend **dentro de WSL** (ver nota UNC abajo)

> **Nota UNC (Windows + WSL):** `npm install` desde Windows falla sobre la ruta
> de red `\\wsl.localhost\...` porque `cmd.exe` no acepta rutas UNC como
> directorio de trabajo (el postinstall de `esbuild` revienta). Corre el
> frontend **desde WSL**, donde la ruta `/home/...` es nativa.

## Backend (FastAPI)

Desde `backend/`, con un entorno virtual de Python:

```bash
cd backend
python -m venv .venv

# Activar el venv:
#   Windows (PowerShell):  .venv\Scripts\Activate.ps1
#   Windows (git-bash):    source .venv/Scripts/activate
#   Linux/macOS/WSL:       source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API: <http://localhost:8000>
- Docs (Swagger): <http://localhost:8000/docs>
- Health: <http://localhost:8000/health>

## Frontend (Tauri + React) — ejecutar desde WSL

```bash
# Abrir WSL y usar la ruta nativa (NO la ruta \\wsl.localhost de Windows)
cd /home/<usuario>/RuRumin.ai/frontend
npm install

# Solo web (navegador), apunta al backend en localhost:8000
npm run dev            # http://localhost:1420

# App nativa de escritorio (requiere Rust instalado)
npm run tauri dev
```

`npm run tauri dev` compila los crates de Rust la primera vez (lento una vez,
luego cacheado). Si faltan dependencias del sistema en Linux/WSL:

```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

### Variable de entorno (URL del backend)

La URL del backend la define **`VITE_API_BASE_URL`** (ver `frontend/.env.example`):

- En `vite dev` sin definirla, cae por defecto a `http://localhost:8000`.
- En un **build de producción** (el `.exe`) es obligatoria; se inyecta al
  compilar para apuntar al backend desplegado (Cloud Run).

```bash
# Ejemplo de build de producción
cd frontend
VITE_API_BASE_URL="https://rurumin-api-xxxx-uc.a.run.app" npm run build
```

## Soporte Multilingüe (Español, Inglés, Mandarín)

La aplicación soporta análisis en **español (`es`), inglés (`en`) y mandarín
(`zh`)**. El idioma se elige en la vista *Home* (selector junto a la subida del
`.docx`) y se propaga en la petición `POST /api/analyze-transcript` mediante el
campo obligatorio `language`. No hay traducción cruzada: el documento, la
interfaz y el análisis generado comparten un único idioma.

- **UI**: un diccionario ligero (`frontend/src/utils/i18n.ts`) con la función
  `tr(lang, key, vars)` localiza navegación, botones, estados de carga, toasts,
  errores del extractor de `.docx`, el diagrama del árbol, el popup de
  configuración, el gestor de cuotas de IA, el toggle *Aceptados/Rechazados* y la
  vista Fusión.
- **Análisis (LLM)**: `backend/app/prompts.py` arma el prompt en el idioma
  elegido; las justificaciones y nombres de concepto se generan en ese idioma.

### Decisión técnica de arquitectura

> **La UI y el análisis del LLM se adaptan al idioma seleccionado, pero el
> contrato de datos JSON entre el backend y Gemini mantiene sus llaves
> estandarizadas en español para garantizar la validación estricta con
> Pydantic.**

Es decir: aunque el análisis se pida en inglés o mandarín, las **llaves** del
JSON de salida permanecen en español (`conceptos_ganadores`, `k_top_score`,
`motivo_descarte`, …) — sólo los **valores** se localizan. El prompt incluye una
directiva inviolable que obliga este comportamiento, de modo que el esquema
Pydantic (`app/llm_schema.py`) nunca recibe una clave traducida y la validación
no puede romperse por idioma. Esto desacopla el formato del modelo del formato
de presentación y mantiene un único esquema estable para todos los idiomas.

## Funcionalidades clave

### Síntesis Piramidal

El análisis se organiza como una **pirámide de conceptos**: la capa base (nivel 0)
es la más ancha y **cada capa superior conserva estrictamente menos conceptos** que
la inferior, hasta converger en la **cúspide** en **un único concepto central** que
resume toda la entrevista.

- **Automático:** el backend deriva los anchos a partir de `k_top` con
  `pyramidal_k_sequence` (p. ej. `[5, 4, 3, 2, 1]`), garantizando el decrecimiento
  estricto y la cúspide en 1.
- **Manual:** desde el popup de configuración eliges los conceptos por capa; la UI
  fuerza la regla piramidal (decreciente, última capa fija en 1) y los envía como
  `options.k_per_layer`, validado por Pydantic en el backend.

Además, el prompt exige la **máxima densidad de `frases_origen`** por concepto
(exhaustividad sobre escasez): cada concepto queda respaldado por todas las citas
posibles del texto.

### Pre-Pasada Estructural (Pass 0)

Opción marcable en el popup de configuración: **«Considerar los temas/secciones
estructurales de la entrevista (1 pasada de IA extra)»**. Cuando se activa, antes
de las capas temáticas se ejecuta una **Pasada 0** barata que lee la transcripción
y extrae solo su **esqueleto estructural**: los capítulos, apartados o fases de la
entrevista (p. ej. `(一）過去使用交友軟體的經驗`), copiados de forma textual y en orden.

- **Cómo mejora el análisis:** esos `structural_themes` se **inyectan como
  contexto en el prompt del Layer 0**, de modo que la IA agrupa los conceptos
  respetando el hilo estructural real de la entrevista en lugar de trocearla a
  ciegas.
- **Contrato de datos:** los `structural_themes` se guardan en
  `metadata.structural_themes` del `AnalysisRecord`, por lo que quedan disponibles
  para **fusiones futuras** (cada proyecto puede aportar su estructura).
- **Coste:** exactamente **una** llamada adicional a Gemini (se contabiliza en
  `metadata.total_runs` y se descuenta de la cuota). Si la Pasada 0 falla, el
  análisis continúa sin contexto estructural (degradación elegante).
- Implementación: `build_structural_prompt` (prompt), `StructuralLLMOutput`
  (validación), `extract_structural_themes` (orquestación) en el backend.

### Cuotas Locales de IA

El nivel gratuito de Gemini limita las peticiones **por día (RPD)** por modelo. Como
esta app es el único consumidor de esa cuota, la **simulamos en local** (IndexedDB,
`frontend/src/services/quota.ts`):

- El **gestor de IA** (botón ✨ junto a *Importar*) lista los 4 modelos de la
  cascada con sus **fortalezas/debilidades** y los **usos restantes hoy**.
- Cada análisis descuenta `metadata.total_runs` peticiones del **modelo activo**; el
  contador se **reinicia automáticamente** al cambiar el día.
- El modelo elegido viaja como `options.model` en la petición de análisis.

### Fusión Multi-Proyecto

Permite **combinar varios proyectos** para encontrar sus **macro-temáticas comunes**:

1. En *Home*, marca las casillas de **2 o más** documentos y pulsa **Fusionar** (con
   menos de 2 seleccionados, un *toast* lo advierte).
2. Elige la estructura en el popup de configuración (igual que un análisis normal).
3. El backend reúne los **conceptos aceptados** de cada proyecto y los re-analiza
   con **10 pasadas por capa** mediante un **prompt de síntesis cruzada estricto**
   (`build_merge_prompt`, `POST /api/merge-projects/stream`) para que emerjan los
   patrones transversales compartidos por varios proyectos.
4. El resultado se guarda como un **nuevo proyecto etiquetado «Fusión»** y se abre en
   la **vista Fusión**: pantalla dividida 50/50 con el **DAG** del merge a la
   izquierda y la **vista apilada filtrable** a la derecha (ver abajo).

#### Estrategia de Fusión Optimizada (evita el agotamiento de tokens del LLM)

Enviar las **transcripciones completas** de hasta 8 documentos saturaba el contexto
del modelo y provocaba fallos de esquema JSON (**error 502**). La fusión ahora
construye un **corpus liviano** que contiene **únicamente los `conceptos_aceptados`**
(nombre + justificación) y sus `structural_themes`, **sin las transcripciones crudas
ni las `frases_origen`** (que eran el grueso de los tokens). Como cada proyecto
aporta solo su síntesis ya destilada, el payload cabe holgadamente en el contexto y
el esquema estricto deja de romperse. El prompt cruzado pide a la IA encontrar los
**patrones comunes entre proyectos** para construir las nuevas macro-capas.

#### Vista Apilada Filtrable (highlights correctos)

Concatenar varios documentos en una sola cadena rompía los índices absolutos
`[start, end]` que necesita `buildOverlapSegments` para resaltar. La vista Fusión
**no concatena**: renderiza un **bloque de texto independiente por documento de
origen** (`sources`), apilados verticalmente. Cada bloque calcula su propia
superposición sobre **su texto local**, por lo que los índices nunca colisionan
entre documentos. Encima de los bloques hay **chips de toggle** para mostrar/ocultar
cada documento; al hacer clic en un **macro-concepto del DAG** se filtran los
conceptos base y se resaltan en los bloques que los contienen.

## Docker (backend → Cloud Run)

```bash
cd backend
docker build -t rurumin-api .
docker run --rm -p 8080:8080 rurumin-api      # http://localhost:8080
```

La imagen respeta `$PORT` (default 8080), el estándar de Cloud Run. Despliegue
de referencia:

```bash
gcloud run deploy rurumin-api --source backend --region us-central1 \
  --allow-unauthenticated --port 8080
```

## CI/CD — Instalador de Windows

`.github/workflows/release.yml` compila el instalador (`.msi` + `.exe` NSIS) en
`windows-latest` usando `tauri-apps/tauri-action` (Tauri v2).

- **Disparadores:** push de un tag `v*` (crea un GitHub Release en borrador con
  los instaladores) o ejecución manual (`workflow_dispatch`).
- **Secreto requerido:** `VITE_API_BASE_URL` (URL de Cloud Run) en
  *Settings → Secrets and variables → Actions*.

```bash
git tag v0.1.0 && git push origin v0.1.0   # dispara la build + release
```

Los instaladores también quedan como *artifacts* del workflow.

## Íconos de Tauri

Regenerar el set de íconos desde un PNG base de 1024×1024:

```bash
cd frontend
npm run tauri icon path/al/icono-1024.png   # genera en src-tauri/icons/
```
