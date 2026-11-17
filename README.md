# Audio Splitter

Browser-only tool to split one long audio file (hours, hundreds of MB) into named segments. No backend; files never leave your machine.

**Live:** https://bacali95.github.io/audio-splitter/ (deployed to GitHub Pages whenever a GitHub Release is published; can also be run manually from the Actions tab).

## Run

```bash
bun install          # requires Bun ≥ 1.4 (https://bun.sh); Node.js is not needed
bun run dev         # http://localhost:5173
bun run build       # type-check + production build into dist/
bun run typecheck   # type-check only
bun run test        # unit tests (time, names, colours, formatting, locale files)
```

## How it works

- Playback uses a plain `<audio>` element on an object URL; the file is never decoded whole.
- The waveform comes from ffmpeg.wasm (single-thread core, self-hosted, no COOP/COEP needed). The file is mounted with WORKERFS (no copy), decoded to 4 kHz mono, and reduced to about 50 peaks per second. Peaks are cached in IndexedDB.
- Segments autosave to localStorage (`audio-splitter:v1:<fingerprint>`). The fingerprint is a SHA-256 of the size plus the first, middle and last 1 MiB. Edits are saved within 300 ms and flushed immediately on close, file switch or tab hide.
- **Resume:** click a session under *Recent sessions*. In Chromium (Chrome, Edge, Brave…) files opened with *Browse files* or drag-and-drop keep a file handle in IndexedDB, so the session reopens directly (the browser may ask once for read access). In Firefox/Safari, or if the file was moved, you're asked to pick it again; picking a different file starts a new session and says so.
- Export uses `-ss/-to` before `-i` with `-c copy` (lossless, cuts on audio-frame boundaries, about 20-30 ms). The optional "Re-encode" checkbox gives sample-accurate cuts (mp3: libmp3lame -q:a 2, m4a/aac: aac 192k, ogg/opus/webm: libopus 128k, flac). It is disabled for WAV (already exact) and for any format whose encoder is missing from the core.

## Shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause |
| Left / Right | Seek 5 s (Shift: 30 s) |
| `[` / `]` | Mark start / mark end and create segment |
| Delete / Backspace | Delete the selected segment (the toast has an Undo action) |
| Esc | Clear the selected segment and any pending start |
| Ctrl/Cmd + wheel | Zoom |
| Drag on waveform | Create a segment |
| Click a region or a row | Select that segment (the other one follows) |

Shortcuts are ignored while typing in inputs and while the export dialog or another popup is open.

## Segments

- Each segment gets a colour from a fixed 8-hue palette by its position when sorted by start time (`src/lib/colors.ts`). The colour is the same on the waveform, in the list and in the export dialog, and changes only when the order changes.
- After `[` / "Mark start" a marker and a hint appear; "Mark end" stays disabled until a start is set. Marking an end at or before the start shows an error and keeps the start.
- Names are editable in the list and in the export dialog (same field). An empty name shows the default (`<file>_01`) as placeholder.

## Design

Plain CSS, no Tailwind. `src/styles/tokens.css` holds the shadcn "neutral" theme tokens (light, dark via `prefers-color-scheme`, or force with `<html data-theme="dark|light">`) and maps `@ui-sdk`'s `--ui-*` variables onto them. `src/styles/ui.css` styles the SDK parts after the shadcn "Mira" style; buttons are one rule set driven by `data-variant` (`outline`, `secondary`, `ghost`, `ghost-destructive`, `destructive`) and `data-size` (`sm`, `lg`, `icon`, `icon-sm`). The waveform reads its colours from the tokens at runtime and follows theme changes. Font: Inter (self-hosted via `@fontsource-variable/inter`).

## Internationalisation

Stack: `i18next` + `react-i18next` + `i18next-browser-languagedetector`, with `i18next-resources-to-backend` for lazy loading. Setup lives in `src/i18n/index.ts` (imported in `main.tsx` before `App`).

- **Languages:** `en, fr, ar, es, de, pt-BR, it, ru, zh-CN, ja` (`src/i18n/languages.ts`: code, native name, direction). English is bundled in the main chunk and is what renders first; any other language is a separate JSON chunk that is fetched after detection, so the UI never shows raw keys. The language switcher is in the header.
- **Detection:** `localStorage["audio-splitter:lang"]`, then `navigator.languages`. Regional variants collapse onto what we ship (`fr-CA` -> `fr`, `pt`/`pt-PT` -> `pt-BR`, `zh`/`zh-Hans`/`zh-SG`/`zh-TW` -> `zh-CN`, ...; see `resolveLanguage`). Anything else falls back to `en`. Picking a language in the switcher persists it.
- On every language change `<html lang>` and `<html dir>` (`rtl` for `ar`) and `document.title` are updated.

### Using translations

- Components: `const { t } = useTranslation()`; `t('segments.title')`. Keys are type-checked against `en.json` (`src/i18n/i18next.d.ts`), so a typo fails `tsc`.
- Outside React (toasts, callbacks): `import i18n from './i18n'` and call `i18n.t(...)` at call time.
- Non-UI modules (`lib/*`) never return English text. They return codes (`validateName` -> `'required' | 'forbiddenChars' | ...`, `validateRange` -> `'endBeforeStart' | ...`) or throw `AppError(code, params)`; the UI turns those into text (`errors.name.<code>`, `errors.range.<code>`, `describeError()`).
- Rich text uses `<Trans i18nKey=... components={{ ... }} />` with named tags such as `<time>`, `<ext>`, `<endKey/>`, `<strong>`. Translators must keep the tags.
- Numbers and dates go through `Intl` (`formatRelative`, `formatPercent`, `formatDecimal`, `formatFileSize`, all taking a `locale`) with Latin digits so they match i18next counts. **Timecodes are not translated or localised**: `formatTime` always yields ASCII `HH:MM:SS.mmm`, because it is also the editable input format.

### Key conventions

`area.element` or `area.group.element`, camelCase, English-meaning not English-wording (`header.export`, `transport.markStart`, `segments.empty.title`, `export.dialog.title`, `toast.restored`, `errors.name.required`).

| Prefix | Content |
| --- | --- |
| `header`, `language`, `dropzone`, `filePicker`, `loading`, `recent` | Start screen, header, loading and recent sessions |
| `transport`, `shortcuts`, `waveform` | Toolbar labels/tooltips, shortcuts popover (`shortcuts.keys.*` are key names), waveform marker |
| `segments`, `export` | Segment list; export dialog, its states and success screen |
| `toast` | Toast titles, descriptions and action labels |
| `errors` | Validation/range/system error texts |
| `aria` | Labels that exist only for assistive tech (`aria-label`); text that is also visible lives with its feature |

Placeholders are `{{name}}`. Plurals use i18next suffixes: `key_one` / `key_other` in `en.json`; other languages add the forms their CLDR rules need (`ar`: `_zero _one _two _few _many _other`, `ru`: `_one _few _many _other`, `fr/es/it/pt-BR`: `_one _many _other`, `ja/zh-CN`: `_other` only). Always pass `count`.

### Adding a language

1. Add `{ code, nativeName, dir }` to `LANGUAGES` in `src/i18n/languages.ts` (and a mapping in `resolveLanguage` if regional variants should collapse onto it).
2. Copy `src/i18n/locales/en.json` to `src/i18n/locales/<code>.json` and translate the values (keep keys, `{{vars}}` and tags).
3. Add the plural forms the language needs (`new Intl.PluralRules('<code>').resolvedOptions().pluralCategories`).
4. If it is right-to-left set `dir: 'rtl'`. Layout is mirrored with CSS logical properties; waveform, timeline, time inputs and timecodes stay LTR on purpose.
5. Run `bun run test src/i18n`: `locales.test.ts` checks every key and plural form exists, that no value is empty and that all `{{vars}}`/tags survive. `I18N_REPORT=1 bun run test src/i18n/locales.test.ts` also lists still-untranslated keys per locale (a file that is still an exact copy of `en.json` is allowed to lack extra plural forms).

### RTL

`<html dir="rtl">` mirrors flex/grid layout; the stylesheets use logical properties (`margin-inline-start`, `inset-inline-end`, `border-inline-start`, `text-align: start`). Direction-implying icons get `.flip-rtl`. The waveform card, the playback controls, sliders, time inputs and readouts are forced `dir="ltr"`, so the left/right arrow keys always mean back/forward in time. Fonts: Inter plus system fallbacks (`Noto Sans Arabic/JP/SC`, no downloads).

## Browser support

- Chromium (Chrome, Edge, Brave): export asks for a folder once (File System Access API) and writes every file there.
- Firefox / Safari: export downloads a single ZIP (store, no compression).
- The browser must be able to play the file in an `<audio>` element.

## Limits

- ffmpeg.wasm via WORKERFS handles files up to about 2 GB.
- First-time peak generation is decode-bound in WebAssembly: roughly a minute or two for a 2 hour file. Later loads are instant from the cache.
- Each exported segment is held in memory briefly (and, in ZIP mode, until the archive is finished).
- The wasm core adds about 32 MB to the build, but it is only fetched when needed (first peak generation or export).
