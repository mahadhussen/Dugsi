# Assessment Trainer

A local training tool for **Matrigma-style matrix reasoning** and **MAP-style
personality statements**. It runs on your own computer, next to the Dugsi site
in this repository but completely separate from it (own `package.json`, own
database, port **3100**).

> **Intended use:** practice with your own practice questions and with the
> synthetic questions the app generates. It is not meant to be used during a
> real employer's recruitment test.

What it does:

- **Analyze screenshot** – drag and drop (or paste) a PNG, JPG or WEBP up to 10 MB.
  The app finds the matrix even when the screenshot also contains browser chrome,
  text, timers and buttons, extracts every object, verifies rules against the
  complete rows/columns, picks an answer only when a rule is verified, and shows
  confidence, a step-by-step explanation and overlays. If the matrix can't be
  detected it says *"Unable to reliably detect the matrix."*, shows the detected
  region and the problem, and never guesses.
- **Matrix practice** – synthetic questions with known solutions in 11 categories
  and 4 difficulty levels; adaptive mode (more questions in weak categories),
  single-category mode, and timed tests (5/10/20 questions, per-question and
  session timers).
- **Personality practice** – statements on a 7-point scale with explanations of
  what each statement describes and how agreeing and disagreeing differ. The
  app has **no correct answers** and never suggests one; when related statements
  get answers pointing in different directions it shows *"These statements appear
  related."* and explains the difference.
- **Dashboard, statistics and question bank** – accuracy, response times, weakest
  and strongest categories, accuracy by category and difficulty, trends over time,
  and **confidence calibration** (predicted confidence vs. actual correctness).

## Contents

- [Installation](#installation)
- [Environment variables](#environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Production build](#production-build)
- [Architecture](#architecture)
- [Solver architecture](#solver-architecture)
- [AI provider configuration](#ai-provider-configuration)
- [Database setup](#database-setup)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)

## Installation

Requirements: **Node.js 20+** (22 recommended) and **Python 3.10+**.

```bash
cd assessment-trainer
cp .env.example .env
npm install                          # also runs `prisma generate`
pip install -r python/requirements.txt   # opencv-python-headless, numpy, pytest
npm run setup                        # creates prisma/dev.db and seeds it
npm run dev                          # http://localhost:3100
```

Tip: use a virtual environment for Python (`python3 -m venv .venv && . .venv/bin/activate`)
and point `PYTHON_BIN` at it.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite file (relative to `prisma/`) |
| `PYTHON_BIN` | `python3` | Python interpreter with OpenCV installed |
| `PYTHON_VISION_DIR` | `./python` | Location of the vision package |
| `VISION_PROVIDER` | `local` | `local` (OpenCV + tesseract.js) or `anthropic` (Claude used for OCR) |
| `TEXT_PROVIDER` | `local` | `local` (keyword lexicon) or `anthropic` (Claude classifies statements) |
| `REASONING_PROVIDER` | `local` | `local` (template explanations) or `anthropic` (plain-language rewrite) |
| `ANTHROPIC_API_KEY` | – | Required only when a provider is set to `anthropic` |
| `ANTHROPIC_MODEL` | `claude-opus-5` | Claude model for the `anthropic` providers |
| `UPLOAD_DIR` | `./data/uploads` | Where screenshots are saved **only** when image storage is enabled |
| `TESSDATA_DIR` | `./data/tessdata` | OCR language data (copied from `@tesseract.js-data/*` automatically) |

## Development

```bash
npm run dev            # Next.js dev server on port 3100
npm run typecheck      # TypeScript
npm run test-data      # re-render the screenshot fixtures in test-data/screenshots
```

Hotkeys in matrix practice: **1–6** choose an option · **Enter** submit · **N** next ·
**R** reset the question · **Space** pause (hides the matrix and stops the clocks).
In personality practice: **1–7** answer · **Space** show/hide the explanation · **N** next.

## Testing

```bash
npm test               # Vitest: solver, generator, vision bridge, TypeScript vision, MAP, OCR, statistics, database, API
npm run test:python    # pytest: preprocessing, matrix/cell detection, object extraction
npm run benchmark      # solver on 100 synthetic questions per category (add a number for more)
npm run benchmark:vision   # screenshot -> OpenCV -> solver, PNG / JPEG q70 / downscaled
npm run benchmark:vision-js  # same, with the pure TypeScript (browser) vision pipeline
npm run test:all       # everything above
```

Tests use a new, empty SQLite file in the system temp folder, so they never touch
`prisma/dev.db`.

Measured results (this repository, September 2026):

| Check | Result |
|---|---|
| Solver, 100 generated questions × 11 categories | 99.9 % correct, **0 wrong**, 1 abstention |
| Screenshot → vision → solver, 330 renders (PNG, JPEG q70, 0.7× scale) | 97.3 % correct, **0 wrong**, the rest abstained |
| Same with the TypeScript (browser) vision, 198 renders | 96.5 % correct, **0 wrong**, the rest abstained, ~70 ms each |
| Object extraction vs. ground truth on the fixtures | every shape, fill, rotation and count correct |
| Confidence calibration (solver benchmark) | 90–100 % confidence → 100 % correct |

"Abstained" means the solver reported *Uncertain – inspect manually* (or no rule)
instead of guessing. These numbers are for the app's own synthetic style; real
screenshots from other layouts can behave differently, which is why every answer
comes with a confidence score and the checks behind it.

## Production build

```bash
npm run build
npm start              # http://localhost:3100
```

The app needs a Node server (API routes and the Python bridge), so it is not a
static export like the Dugsi site.

## Architecture

```
assessment-trainer/
  app/                    Next.js App Router pages + API routes
    page.tsx              Dashboard
    practice/matrigma     Matrix practice (adaptive, category, timed)
    practice/map          Personality statement practice
    analyze               Screenshot upload + analysis
    statistics, question-bank, settings
    api/                  analyze (NDJSON progress stream), questions, attempts,
                          sessions, stats, map/*, images, data, settings, health
  components/             UI (shadcn-style components in components/ui)
  lib/
    matrigma/             types, shape geometry, SVG renderer, generator
    solver/               features, rule engine, transformations, 16 strategies,
                          decision engine, confidence, explanations
    vision/               Python bridge (with cache), OCR, vision → problem
    vision/js/            the same vision pipeline in pure TypeScript (runs in a
                          browser; used by the app when Python is unavailable)
    map/                  personality model (5 domains, 25 facets), statement bank,
                          classifier, consistency engine, OCR text extraction
    statistics/           stats, calibration, adaptive selection
    ai/                   VisionProvider / TextProvider / ReasoningProvider
    database/             Prisma client + repository functions
  python/vision/          OpenCV pipeline (preprocess, detect, objects, pipeline, cli)
  python/tests/           pytest suite
  prisma/                 schema.prisma (SQLite) + seed
  scripts/                benchmarks, test-data generator, debugging helpers
  tests/                  Vitest suites
  test-data/screenshots/  rendered screenshots + ground-truth JSON
```

Data flow for a screenshot:

```
upload (validated: type, 10 MB) ──► VisionProvider.extractMatrix
   python -m vision.cli  (stdin → JSON, cached by SHA-256)
     preprocess: decode · resize · grayscale · denoise (if noisy) · contrast
                 normalisation · adaptive threshold · Canny edges · perspective
                 correction (only if the grid is skewed)
     detect:     square boxes → size groups → tight lattice = matrix;
                 lattice slot without a box = missing cell;
                 second row of equal boxes = answer options (gaps inferred)
     objects:    per cell: Otsu threshold → contours → shape, fill, size,
                 rotation, position, count + confidence
  ──► lib/solver.solveMatrix  ──► explanation + confidence ──► UI overlays
```

`lib/vision/js/` implements the same stages without OpenCV (adaptive threshold,
enclosed square cells, lattice + missing slot, options row, per cell Otsu,
connected components, convex hull shape rules) and returns the same JSON. The app
uses it automatically when Python cannot be started, and the standalone web demo
uses it for drag and drop screenshot analysis entirely in the browser.

The Python part is only the eye. All reasoning happens in TypeScript on a
structured representation, which the generator, the UI and the tests share:

```json
{ "objects": [ { "shape": "triangle", "fill": 0, "size": 0.7, "rotation": 90, "x": 0.5, "y": 0.5 } ] }
```

Vision output also contains the summary the specification asks for:
`{ "matrix": { "rows": 3, "columns": 3 }, "missingCell": [2, 2], "answerOptions": 6 }`.
The detector supports any `rows × cols` grid (2×2, 3×3, 4×4 tested) and the
solver handles single-row sequences.

## Solver architecture

**Principle: accurate training, not fast guessing.** An answer is only given when
a rule is verified on the complete rows/columns.

1. **Features** – each cell is summarised as count, shape, corners, fill, size,
   rotation (compared modulo the shape's symmetry, e.g. 120° for a triangle),
   horizontal/vertical slot, position set, object set and shape mix. Small
   decorative elements are ignored for the shape/fill/size attributes.
2. **Rule generator** – for every attribute × axis (rows, columns, wrapped
   diagonals, sequence windows) × rule kind (constant, progression,
   distribute-three, alternation, add, subtract, union, difference, XOR,
   intersection) it
   generates a hypothesis → applies it → compares with the known cells → computes
   the error → keeps it only if it holds on **every** complete line, and records
   its complexity. Set rules need at least two independent confirmations.
3. **Whole-cell transformations** – rotation (±45/90/180°), left-right and
   top-bottom reflection, and translation with wrap-around, fitted per step and
   validated on all complete pairs.
4. **16 independent strategies** (horizontal/vertical/diagonal transformation,
   rotation, reflection, translation, object count, size, fill, orientation,
   shape progression, composition, subtraction, XOR, alternating pattern,
   rule combination) each score every answer option.
5. **Decision engine** – candidate rules are ordered by *coverage* (how much of
   the cell they explain) and *simplicity*; a rule is kept only if some option
   satisfies it together with all rules kept before it. This yields "highest
   consistency + lowest unnecessary complexity". Rejected alternatives are listed.
6. **Answer matching** – options are checked by inserting them into the
   incomplete line and re-verifying every kept rule; similarity to the predicted
   cell is shown as "% match".
7. **Confidence** is computed, never random, from: rule consistency, number of
   validated lines, the best option's score, the margin to the runner-up,
   agreement between independent strategies, and visual extraction quality.
   If two options are equally consistent, or two validated explanations point to
   different options, the solver gives **no answer** and lists the candidates.
   Below 60 % the UI shows *"Uncertain – inspect manually"*.
8. **Calibration** – every prediction with a known answer (generated questions,
   and screenshots where you enter the correct answer) is binned by confidence;
   once a bin has 20+ samples its observed accuracy is blended into new
   confidence scores. The table is on the Statistics page.

Generated questions are built from explicit rules (so the answer is known by
construction). Distractors are near misses that each break a rule, are checked to
be visually distinct, and ambiguous designs (for example two set operations that
both fit the complete rows) are rejected. Difficulty: *easy* = one rule, *medium* =
one rule plus distracting elements, *hard* = two interacting rules, *expert* =
three.

## AI provider configuration

The rest of the app only knows three interfaces (`lib/ai/types.ts`):

```ts
interface VisionProvider   { extractMatrix(img, mime); extractText(img, mime) }
interface TextProvider     { analyzeStatement(text) }
interface ReasoningProvider{ explain(problem, solution) }
```

- `local` (default): OpenCV + tesseract.js + keyword lexicon. Nothing leaves your computer.
- `anthropic`: set `ANTHROPIC_API_KEY` and e.g. `TEXT_PROVIDER=anthropic`. Claude
  is used for OCR of personality statements, statement classification and
  plain-language rewrites of verified explanations. Requests use structured JSON
  output and the API's server-side refusal fallback.

### Matrix layouts the local pipeline cannot read

Matrices the local pipeline can read are always solved by the local verifier.
When it cannot read a layout (no cell borders, line textures, 8 numbered
options, …) or is not certain, and `ANTHROPIC_API_KEY` is set, the screenshot is
sent to Claude (`lib/ai/matrix-reading.ts`). Claude describes every cell, tests
rules along rows and columns, checks every option and returns structured JSON.
The UI labels this as an unverified AI reading, shows the rules and the
option-by-option check, and gives **no answer** unless exactly one option fits,
the answer agrees with that check and the confidence is at least 60 %. Set
`AI_MATRIX_FALLBACK=off` to never send matrix screenshots to Claude.
Each image is read `AI_MATRIX_VOTES` times independently (default 3); an answer
is only shown when every reading is certain and all name the same option, so a
disagreement gives "Uncertain" instead of a possibly wrong answer.

Tick **Let me answer first** on the Analyze page to use screenshots from other
practice sites as training: the solution stays hidden until you pick an option
(keys 1–8), then your choice is compared with it.

Analysis starts as soon as an image is dropped, chosen or pasted (Ctrl+V / ⌘V
anywhere on the page, or the *Paste image* button).

To add another provider, implement the interfaces in `lib/ai/<name>.ts` and select
it in `lib/ai/index.ts`.

## Database setup

SQLite through Prisma (`prisma/schema.prisma`). Models: `User`, `Question`,
`QuestionCategory`, `GeneratedQuestion`, `QuestionAttempt`, `MAPStatement`,
`MAPResponse`, `PracticeSession`, `PerformanceMetric`.

```bash
npm run db:push        # create/update tables in prisma/dev.db
npm run db:seed        # statement bank, categories, starter questions
```

A `QuestionAttempt` stores questionId, selectedAnswer, correctAnswer, isCorrect,
responseTime, difficulty, category, confidence, solverStrategy and timestamp.

## Privacy

- Screenshots are analysed in memory and **not stored** unless you enable
  *Store uploaded screenshots* in Settings.
- Settings has **Delete images**, **Delete history** and **Clear all data**; the
  analyze page has **Delete image** for a stored screenshot.
- With the default `local` providers no data leaves the machine.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Settings shows *Python / OpenCV: not available* | `pip install -r python/requirements.txt`, or set `PYTHON_BIN` to the interpreter that has OpenCV. Until then matrix screenshots use the TypeScript vision pipeline (slightly lower recall, same abstain behaviour). |
| "Unable to reliably detect the matrix" | Crop the screenshot to the matrix plus the answer options, use a larger/sharper screenshot, or choose the question type manually. The detector expects equally sized, bordered cells. |
| An answer is "Uncertain – inspect manually" | Check the detected objects table and overlays; low extraction quality or two equally valid rules lower confidence on purpose. |
| OCR language data missing | `npm install` (installs `@tesseract.js-data/swe` and `/eng`); OCR runs offline |
| `Environment variable not found: DATABASE_URL` | `cp .env.example .env` |
| Port 3100 in use | `npx next dev -p <port>` |
| Charts are empty | Answer a few practice questions first |
