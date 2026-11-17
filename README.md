# Audio Splitter

Browser-only tool to split one long audio file (hours, hundreds of MB) into named segments. No backend; files never leave your machine.

**Live:** https://bacali95.github.io/audio-splitter/ (deployed to GitHub Pages on every push to `main`).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npx tsc --noEmit   # type-check only
npx vitest run     # unit tests (time, name validation, segment colours)
```

## How it works

- Playback uses a plain `<audio>` element on an object URL; the file is never decoded whole.
- The waveform comes from ffmpeg.wasm (single-thread core, self-hosted, no COOP/COEP needed). The file is mounted with WORKERFS (no copy), decoded to 4 kHz mono, and reduced to about 50 peaks per second. Peaks are cached in IndexedDB.
- Segments autosave to localStorage (`audio-splitter:v1:<fingerprint>`). The fingerprint is a SHA-256 of the size plus the first, middle and last 1 MiB. To resume, pick the same file again.
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

## Browser support

- Chromium (Chrome, Edge, Brave): export asks for a folder once (File System Access API) and writes every file there.
- Firefox / Safari: export downloads a single ZIP (store, no compression).
- The browser must be able to play the file in an `<audio>` element.

## Limits

- ffmpeg.wasm via WORKERFS handles files up to about 2 GB.
- First-time peak generation is decode-bound in WebAssembly: roughly a minute or two for a 2 hour file. Later loads are instant from the cache.
- Each exported segment is held in memory briefly (and, in ZIP mode, until the archive is finished).
- The wasm core adds about 32 MB to the build, but it is only fetched when needed (first peak generation or export).
