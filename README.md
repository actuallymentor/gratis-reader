<div align="center">

# Gratis Reader

**Read any book in the language you're learning, rewritten for your level.**

[**reader.gratis.sh**](https://reader.gratis.sh)

[![Deploy](https://github.com/actuallymentor/gratis-reader/actions/workflows/deploy-web.yml/badge.svg)](https://github.com/actuallymentor/gratis-reader/actions/workflows/deploy-web.yml)
[![Version](https://img.shields.io/github/package-json/v/actuallymentor/gratis-reader?label=version)](CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## TL;DR

Drop in an EPUB (or pick one of 1,857 Project Gutenberg classics), choose a target language and a proficiency level, read. An LLM rewrites each sentence for that level instead of translating it literally. Tap a sentence for the original, tap a word for its meaning, ask for an explanation of any translation choice.

Bring your own [OpenRouter](https://openrouter.ai) key. No backend, no accounts, no tracking. Books, key and translations live in your browser.

## Features

- **Level-adapted translation**, from "Toddler" (A1) to "Adult" (C1–C2). Simplified vocabulary and grammar, not word-for-word output.
- **Tap to peek**: sentence → original text, word → gloss, long press → why it was translated that way.
- **Any language**, with dialect hints (e.g. Kosovar Gheg Albanian).
- **Classic library**: 1,857 public domain books, searchable by title, author or category.
- **Turbo mode**: looks up on-screen words (and the next screens) in the background, so word taps are instant.
- **Model choice**: GPT-6 Luna (default), Gemini 3.8 Flash, Claude Sonnet 5.5 and more, with per-book cost estimates.
- **Offline-first PWA**: installable, cached translations, works without a connection once a chapter is loaded.
- **Light / dark / system** themes, keyboard navigation, screen-reader semantics.

## Stack

| | |
| --- | --- |
| UI | React 19, styled-components, Zustand |
| Books | epub.js, IndexedDB |
| LLM | OpenRouter chat completions, batched per paragraph |
| Build | Vite, vite-plugin-pwa |
| Tests | Playwright |
| Hosting | Cloudflare Workers static assets |

## Development

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # Playwright, mocked OpenRouter
npm run test:live  # LIVE_API=1, real OpenRouter calls
npm run build
```

Classic library catalogue:

```sh
npm run gutenberg            # fetch metadata + covers + EPUBs
npm run gutenberg:variants   # regenerate cover sizes only
npm run gutenberg:trim       # shrink the catalogue JSON only
```

## Deploy

Push a `package.json` version bump to `main`. GitHub Actions builds and deploys to Cloudflare. **Settings → Version** in the app shows the deployed commit.

Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Notes

- Displayed costs are estimates; provider pricing and reasoning usage vary.
- Keys are stored in `localStorage` and only ever sent to OpenRouter.
- [CHANGELOG.md](CHANGELOG.md) · [SPECIFICATION.md](SPECIFICATION.md)

## License

[MIT](LICENSE)
