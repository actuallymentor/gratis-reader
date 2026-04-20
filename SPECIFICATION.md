# Gratis Reader — Language-Learning E-Reader PWA

> A progressive web app that transforms any ebook into a language-learning tool by translating content page-by-page via LLM, adapting complexity to the reader's proficiency level.

---

## Core Concept

The user uploads an ebook (EPUB/MOBI), selects a target language and proficiency level, and reads the book in that language. Translation is **not literal** — it adapts the vocabulary, sentence structure, and complexity to match the chosen level. Think of it as "rewriting" the book for a reader at that level, not machine-translating it.

Tapping a sentence reveals the original. Hovering a word shows its original-language equivalent. Long-pressing a sentence opens a detailed explanation of the translation choices.

---

## User Flow

```
┌─────────────────────────────────────────────────┐
│  First Launch                                    │
│  → Prompt for OpenRouter API key                 │
│  → Store in localStorage                         │
│                                                  │
│  Library Screen                                  │
│  → Grid/list of uploaded books                   │
│  → "Add book" button (EPUB, MOBI)                │
│  → Tap book → open reader                        │
│                                                  │
│  Reader Screen                                   │
│  → Displays translated text page by page         │
│  → Top-right config icon → settings drawer       │
│  → Tap sentence → toggle original/translated     │
│  → Hover word → tooltip with original word       │
│  → Long-press sentence → explanation popover     │
│                                                  │
│  Settings Drawer                                 │
│  → Target language selector                      │
│  → Proficiency level selector                    │
│  → Font size                                     │
│  → Font family                                   │
│  → Reading theme (light/dark/sepia)              │
└─────────────────────────────────────────────────┘
```

---

## Feature Specification

### 1. API Key Entry

- On first launch (no key in storage), show a clean onboarding screen requesting an OpenRouter API key
- Store the key in `localStorage`
- Provide a way to update/remove the key from settings
- Validate the key with a lightweight OpenRouter API call before accepting

### 2. Book Library

- **Upload**: accept `.epub` and `.mobi` files via file picker or drag-and-drop
- **Storage**: store book files in IndexedDB (localStorage is too small for ebooks)
- **Display**: show cover image (extracted from EPUB metadata), title, and author
- **Actions**: open, delete
- Books persist across sessions — the library is the app's home screen

### 3. Book Parsing

- Parse EPUB using a client-side library (e.g. `epubjs` or similar)
- Parse MOBI with client-side conversion (MOBI support is secondary — EPUB is primary)
- Extract:
  - Metadata (title, author, cover image, language)
  - Table of contents / chapter structure
  - Content split into **pages** (based on viewport) and **sentences** (the atomic unit of translation)
- Each sentence gets a deterministic ID: `{book_hash}:{chapter}:{paragraph}:{sentence_index}`

### 4. Language & Level Selection

When opening a book, the user selects:

#### Target Language
- Free-text or searchable dropdown
- Common languages promoted (Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Albanian, etc.)

#### Proficiency Level

| Level | Label | Description |
|-------|-------|-------------|
| A1 | Toddler | Very simple words, short sentences. "The house was pretty." |
| A2 | Primary Schooler | Basic vocabulary, simple structure. "The old house looked really nice." |
| B1–B2 | High Schooler | Moderate vocabulary, compound sentences. "The gothic-style house had a striking appearance." |
| C1–C2 | Adult | Full complexity, nuance preserved. Near-literal translation. |

Each level is always displayed with **both** the CEFR code and the friendly label.

**Key principle**: lower levels take *extreme* liberties in simplification. The goal is comprehension at that level, not accuracy. "The gothic style house had an architecture that really inspired his soul" → (A1) "The house was beautiful."

### 5. Translation Engine

#### Provider
- **OpenRouter** as the LLM router
- Default model: an OpenAI model via OpenRouter (e.g. `openai/gpt-4o-mini` for cost efficiency)
- Model is configurable in settings

#### Translation Unit
- **Sentence-level** translation — each sentence is translated individually
- **Context window**: the full paragraph (or ±2 sentences minimum) is included as context in the prompt, but only the target sentence is translated
- This preserves coherence while keeping cache keys granular

#### System Prompt Design

The system prompt must:
1. Establish the role: "You are a language teacher translating text for a student"
2. Specify the target language and proficiency level with clear behavioral rules per level
3. Instruct the model to **rewrite** at the target level, not translate literally
4. For lower levels: simplify aggressively — drop idioms, reduce clause nesting, use common vocabulary
5. For higher levels: preserve style, tone, and nuance
6. Output **only** the translated sentence — no explanations, no markup, no preamble

#### Translation Strategy
- Translate the **current page** + **2 pages ahead** (read-ahead buffer)
- On page navigation (next, previous, jump), trigger translation of the new visible page + 2 ahead
- Batch sentence translation requests where possible to reduce API overhead
- Cancel in-flight requests when the user jumps to a different location

### 6. Translation Cache

- **Storage**: IndexedDB (can handle large volumes of cached translations)
- **Cache key**: `{sentence_id}:{target_language}:{proficiency_level}` (sentence_id already contains the book hash)
- **Cache value**: translated sentence text
- On cache hit, skip the API call entirely
- **Offline fallback**: if the network is unavailable, serve cached translations and show a subtle indicator that new translations can't be fetched
- Cache has no automatic expiry — the user can clear it manually from settings

### 7. Reader Experience

#### Page Display
- Render translated text with proper paragraph structure
- Maintain chapter/section headings
- Smooth page transitions (swipe or tap edges to navigate)
- Page progress indicator (percentage and/or page number)

#### Sentence Interaction — Tap to Toggle
- Tap a translated sentence → it swaps to the original language (inline, same position)
- Tap again → swaps back to the translated version
- Visual cue: subtle background highlight on toggled sentences so the user knows which state they're in

#### Word Interaction — Hover/Touch Tooltip
- Hover (desktop) or tap-and-hold briefly (mobile) on a word → tooltip showing the best-guess original-language word
- This is an approximation — since translation isn't word-for-word, use a lightweight LLM call or dictionary lookup
- Cache these word-level lookups aggressively

#### Sentence Explanation — Long Press Popover
- Long-press (or right-click on desktop) a sentence → popover/modal appears
- Content (generated on-the-fly via LLM):
  - Original sentence
  - Translated sentence
  - Word-by-word or phrase-by-phrase breakdown
  - Explanation of translation choices (why certain words were simplified, grammar notes, nuances lost/preserved)
- This is an **on-demand** LLM call — not pre-generated
- Show a loading skeleton while the explanation is being fetched

### 8. Reader Settings

Accessible via a config icon (top-right corner), opening a drawer or panel:

| Setting | Options |
|---------|---------|
| Target language | Searchable dropdown |
| Proficiency level | A1/A2/B1-B2/C1-C2 with friendly labels |
| Font size | Slider or step buttons |
| Font family | Selection of readable fonts |
| Reading theme | Light / Dark / Sepia |
| LLM model | Dropdown of OpenRouter models |
| API key | View/update/remove |
| Clear cache | Button with confirmation |

Changing the target language or proficiency level invalidates untranslated pages and triggers re-translation of the current view.

---

## Technical Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | React (client-side SPA) |
| Bundler | Vite |
| Language | JavaScript (no TypeScript) |
| Styling | styled-components |
| Routing | react-router (BrowserRouter) |
| State (global) | zustand |
| State (URL) | use-query-params |
| Notifications | react-hot-toast |
| Lazy loading | less-lazy |
| Utilities | mentie |
| EPUB parsing | epubjs (or equivalent) |
| Testing | Playwright (E2E) |
| PWA | vite-plugin-pwa (or manual service worker) |

### File Structure

```
src/
├── App.jsx
├── index.jsx
├── index.css
├── components/
│   ├── atoms/
│   │   ├── Tooltip.jsx            # Word hover tooltip
│   │   ├── ProgressBar.jsx        # Reading progress
│   │   ├── LevelBadge.jsx         # Proficiency level display
│   │   ├── Skeleton.jsx           # Loading skeleton
│   │   └── Icon.jsx               # Icon wrapper
│   ├── molecules/
│   │   ├── Sentence.jsx           # Tappable/hoverable sentence
│   │   ├── ExplanationPopover.jsx # Long-press explanation modal
│   │   ├── BookCard.jsx           # Library book display
│   │   ├── FileUploader.jsx       # Drag-and-drop upload
│   │   ├── LanguagePicker.jsx     # Language selection
│   │   ├── LevelPicker.jsx        # Proficiency level selection
│   │   └── SettingsDrawer.jsx     # Reader settings panel
│   └── pages/
│       ├── OnboardingPage.jsx     # API key entry
│       ├── LibraryPage.jsx        # Book library
│       └── ReaderPage.jsx         # The e-reader
├── hooks/
│   ├── use_translation.js         # Translation orchestration
│   ├── use_book.js                # Book parsing and navigation
│   └── use_cache.js               # IndexedDB cache operations
├── modules/
│   ├── open_router.js             # OpenRouter API client
│   ├── prompts.js                 # System prompts and prompt templates
│   ├── epub_parser.js             # EPUB parsing wrapper
│   ├── sentence_splitter.js       # Text → sentence tokenization
│   └── cache.js                   # IndexedDB cache layer
├── stores/
│   ├── settings_store.js          # App settings (zustand)
│   └── library_store.js           # Book library state (zustand)
├── routes/
│   └── Routes.jsx
public/
├── manifest.json                  # PWA manifest
├── service-worker.js              # Offline support
├── favicon.ico
└── assets/
```

### Data Models

#### Book (IndexedDB)
```js
{
    id: `book_abc123`,              // Hash of file content
    title: `Don Quixote`,
    author: `Miguel de Cervantes`,
    language: `en`,                 // Detected origin language
    cover_image: Blob,              // Extracted cover
    file: Blob,                     // Original ebook file
    added_at: `2026-04-01T12:00:00Z`
}
```

#### Translation Cache Entry (IndexedDB)
```js
{
    key: `book_abc123:3:2:7:sq:a1`, // book:chapter:paragraph:sentence:lang:level
    original: `The gothic style house had an architecture that really inspired his soul.`,
    translated: `Shtëpia ishte e bukur.`,
    language: `sq`,
    level: `a1`,
    created_at: `2026-04-01T12:05:00Z`
}
```

#### Settings (localStorage)
```js
{
    api_key: `sk-or-...`,
    model: `openai/gpt-4o-mini`,
    font_size: 18,
    font_family: `Nunito Variable`,
    theme: `light`,
    last_language: `sq`,
    last_level: `a2`
}
```

### Translation Pipeline

```
User navigates to page
        │
        ▼
Determine visible sentences + 2 pages ahead
        │
        ▼
Check IndexedDB cache for each sentence
        │
   ┌────┴────┐
   │ HIT     │ MISS
   │         ▼
   │    Build prompt:
   │    - System prompt (role, language, level rules)
   │    - Context (surrounding paragraph)
   │    - Target sentence
   │         │
   │         ▼
   │    POST to OpenRouter /chat/completions
   │         │
   │         ▼
   │    Store result in IndexedDB cache
   │         │
   └────┬────┘
        │
        ▼
Render translated sentences on page
```

### Prompt Architecture

#### System Prompt (simplified example)

```
You are a language teacher helping a student learn {target_language}.
Your task is to translate/rewrite a single sentence from {source_language}
into {target_language} at the {level_label} ({cefr_code}) proficiency level.

Level rules:
- A1 (Toddler): Use only the 500 most common words. Maximum 8 words per
  sentence. No idioms, no metaphors, no subordinate clauses. Simplify
  aggressively — convey only the core meaning.
- A2 (Primary Schooler): Use common vocabulary (~1500 words). Simple
  sentences, basic conjunctions (and, but, because). Light simplification.
- B1–B2 (High Schooler): Moderate vocabulary. Compound sentences allowed.
  Preserve most meaning but simplify complex idioms and cultural references.
- C1–C2 (Adult): Full vocabulary. Preserve style, tone, nuance, and
  literary devices. Closest to a professional translation.

Respond with ONLY the translated sentence. No explanations, no quotes,
no additional text.
```

#### Explanation Prompt (on long-press)

```
The student is reading a {source_language} book translated to
{target_language} at {level_label} level.

Original: "{original_sentence}"
Translation: "{translated_sentence}"

Explain this translation to the student in {source_language}:
1. Show a word-by-word or phrase-by-phrase mapping
2. Explain why certain words or phrases were simplified or changed
3. Note any grammar points that are useful for a learner
4. Mention any nuances or cultural context lost in simplification

Keep the explanation concise and educational.
```

---

## PWA Requirements

- **Manifest**: app name, icons, theme color, `display: standalone`
- **Service Worker**: cache app shell (HTML, CSS, JS, fonts) for offline launch
- **Offline behavior**: the app shell loads offline; translated pages are served from IndexedDB cache; a subtle banner indicates "offline mode — cached translations only"
- **Installable**: meets PWA install criteria (manifest + service worker + HTTPS)

---

## Performance Considerations

- **Translation batching**: group sentences from the same page into a single request where possible (send multiple sentences, receive multiple translations). Fall back to individual requests if the model struggles with batched output.
- **Request cancellation**: use `AbortController` to cancel in-flight translation requests when the user navigates away from a page
- **Debounced pre-fetch**: on page turn, debounce the read-ahead trigger to avoid unnecessary requests during fast page flipping
- **Lazy rendering**: only render sentences in the visible viewport; virtualize long chapters
- **Cache-first**: always check cache before making an API call

---

## Testing Strategy

### Automated (Playwright E2E)
- Upload an EPUB and verify it appears in the library
- Open a book, verify translated text renders
- Tap a sentence, verify it toggles to original
- Change proficiency level, verify text re-translates
- Verify offline mode serves cached content
- Verify API key validation flow

### Manual (Browser MCP)
- Visual inspection of typography, spacing, and layout
- Hover/tap/long-press interaction testing
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile viewport testing
- PWA install flow

---

## Out of Scope (v1)

- User accounts / cloud sync
- Server-side rendering or backend
- Bookmarks / highlights / annotations
- Text-to-speech / pronunciation
- Dictionary integration beyond tooltip
- Social features (sharing progress, etc.)
- Multiple simultaneous languages per book
- PDF support
