# Chess Trainer

A chess training app for the browser and iOS. Play from lesson positions against Stockfish, with your own configured LLM providing commentary, hints, and summaries. No backend of its own; progress and settings are stored locally (IndexedDB / localStorage on web, Preferences + Keychain on iOS).

## Run (Web)

```bash
npm install
npm run dev
```

Open the local address printed in the terminal. On first run, the single-threaded lite Stockfish build is copied to `public/engine/`.

## Pre-release self-check

```bash
npm run verify
```

See [docs/RELEASING.md](docs/RELEASING.md) for details.

## iOS Simulator / device

```bash
npm run ios:sync   # build + cap sync + sync version to Xcode
npm run ios:open   # open Xcode
```

Bundle ID: `dev.xu.chesstrainer`. Deep link scheme: `chesstrainer://`.

## Settings

The settings page takes an OpenAI-compatible endpoint:

- Base URL (must be HTTPS, e.g. `https://api.openai.com/v1`)
- API Key (stored locally on web; prefers Keychain on iOS, see the settings page's privacy note)
- Model name

For development, copy `.env.example` to `.env.local` (already gitignored) and use the `VITE_LLM_*` variables as defaults.

"Test connection" sends a streaming request and treats receiving the first token as success. It will fail in the browser if the third-party service doesn't allow CORS; the native iOS SSE plugin can bypass some CORS restrictions.

## Adding a lesson

1. Add a `.ts` file under `src/lessons/data/<opening|middlegame|endgame>/` exporting `lesson: Lesson`.
2. Import it in `src/lessons/index.ts` and add it to `LESSONS`.
3. Run `npm test`: validates the FEN, `playerColor`, principle IDs, and that `modelLine` is playable.

## Adding a principle

Append an entry to `PRINCIPLES` in `src/lessons/principles.ts`, then reference it via `principleIds` in a lesson.

## Scripts

| Command | Description |
|------|------|
| `npm run verify` | typecheck + test + production build |
| `npm run ios:sync` | production build and iOS sync |
| `npm run licenses` | regenerate the third-party license list |
