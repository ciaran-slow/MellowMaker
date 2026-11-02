# MellowMaker

A bright, offline-first crochet companion for iOS and Android, built with React Native and Expo. Look up stitches, work through patterns row by row with a built-in counter, and turn YouTube tutorials into step-by-step guides.

## Features

- **Stitch dictionary:** a searchable catalogue of 12 core stitches with abbreviations and step-by-step instructions. Search by name or by the abbreviation patterns use.
- **Pattern library and viewer:** 6 starter patterns plus your own. Each pattern breaks into steps you tick off, with a row and stitch counter built into the viewer.
- **YouTube guide importer:** paste a YouTube link (watch, share, Shorts, embed or live), and MellowMaker fetches the title and thumbnail and plays the video in YouTube's official player. You add the timestamps and steps yourself, by typing or pasting. Tapping a step seeks the video. A guide can be saved as a pattern.
- **Offline by design:** patterns, guides and the dictionary live in a local SQLite database, so everything works without a connection.
- **Playful and accessible:** chunky rounded design, with a colour system where anything that must be read meets contrast requirements, and a Maestro accessibility test flow.

## Privacy by design

The importer never fetches transcripts, captions, chapters or descriptions. It only reads the public title and thumbnail, and keeps the text you paste in as steps. Nothing is sent off the device.

## Status

A working MVP, not yet released.

- The core features above are built and covered by tests.
- The bundled content is original text written for this repo (see [`docs/content-provenance.md`](docs/content-provenance.md)), kept small on purpose: 12 stitches and 6 patterns.
- App Store and Google Play builds with EAS are planned but not configured yet.
- No screenshots or demo yet.

## Tech stack

| Layer | Tools |
|---|---|
| App | React Native, Expo (Expo Router), TypeScript |
| Styling | NativeWind (Tailwind), React Native Reanimated, react-native-svg |
| Data | expo-sqlite (offline-first) |
| Video | YouTube IFrame player via react-native-youtube-iframe and WebView |
| Testing | Jest, Maestro end-to-end flows |
| CI | GitHub Actions: lint (including architecture-boundary checks), typecheck, tests |

## How it was built

Built with Claude Code agents under a documented workflow: a vision and PRD, issue-per-change delivery, scripted checks for architecture boundaries and content provenance, and a smoke-test runbook for each feature. See [`docs/`](docs/) and [`docs/runbooks/`](docs/runbooks/).

## Running it locally

Requires Node 22.13+ or 24+.

```sh
npm install
npm start          # then open on a simulator or device with Expo
```

### Scripts

| Command | Purpose |
|---|---|
| `npm test` | Unit and integration tests (Jest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint plus architecture-boundary checks |
| `npm run check:provenance` | Check bundled content provenance |
| `npm run test:smoke:<flow>` | Maestro end-to-end flows (dictionary, patterns, counter, guides, offline, accessibility and more). Set `APP_ID` to your installed build. |

## Docs

[Vision](docs/vision.md) · [Architecture](docs/architecture.md) · [PRD 0](docs/prd0.md) · [Content provenance](docs/content-provenance.md) · [Runbooks](docs/runbooks/)
