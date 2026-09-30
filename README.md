# Gratis Reader

Read EPUB books with AI translations adapted to your language level.

- **Models:** GPT-6 Luna is the default for new settings. Choose Gemini 3.8
  Flash, Claude Sonnet 5.5, or a previous model in **Settings → LLM Model**.
- Existing model selections are preserved. Obsolete Claude IDs are corrected;
  saved Gemini 2.0 Flash selections move to Gemini 3.8 Flash.
- Bring your own OpenRouter API key. Keys and settings stay in your browser.
- Displayed costs are estimates; provider pricing and reasoning usage vary.

## Development

```sh
npm ci
npm run dev
npm test
npm run build
```

Production deploys through GitHub Actions when a version bump in `package.json`
is pushed to `main`. **Settings → Version** shows the deployed commit.
