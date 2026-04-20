# Gratis Reader — Implementation Plan

> Step-by-step guide for building the app described in SPECIFICATION.md.
> Each phase ends with a verification checkpoint using Playwright E2E tests and manual browser inspection via the `@playwright/mcp` server.

---

## Available Resources

| Resource | Details |
|----------|---------|
| `.env` | Contains `VITE_OPENROUTER_API_KEY` — accessible in Vite via `import.meta.env.VITE_OPENROUTER_API_KEY` |
| `book.epub` | "Smart work beats hard work" by Mentor Palokaj. English, 25 chapters, clean XHTML. Used as demo fixture throughout development and testing. |
| `airier` | Already installed — provides ESLint config and style guide |
| `husky` | Already installed — pre-commit hook runs `npm run lint` |

---

## Phase 0: Project Scaffolding

### 0.1 Vite + React Setup

Create the Vite project in-place (the repo already exists, so scaffold into it):

```bash
npm create vite@latest . -- --template react
```

This will generate `index.html`, `src/`, `vite.config.js`, etc. Then:

- Set up `.nvmrc` with `24`
- Update `package.json`:
  - Keep existing `lint` script and `devDependencies` (airier, husky)
  - Add `"dev": "vite"`, `"build": "vite build"`, `"preview": "vite preview"`
- Remove any TypeScript references Vite may have generated
- Rename `.jsx` files to match our structure

### 0.2 Install Dependencies

Production dependencies:

```bash
npm i react react-dom react-router react-router-dom \
      styled-components zustand use-query-params \
      react-hot-toast epubjs mentie
```

Dev dependencies:

```bash
npm i -D @playwright/test vite-plugin-pwa less-lazy
```

Then install Playwright browsers:

```bash
npx playwright install chromium
```

### 0.3 Configure Vite

`vite.config.js`:

- Import and configure `vite-plugin-pwa` with app name "Gratis Reader", theme color `#7ec0d0`
- Set `define: { 'process.env': {} }` if needed for epubjs compatibility
- Configure `server.port: 5173`

### 0.4 Set Up File Structure

Create the directory skeleton from SPECIFICATION.md:

```
src/
├── App.jsx
├── index.jsx
├── index.css
├── components/
│   ├── atoms/
│   ├── molecules/
│   └── pages/
├── hooks/
├── modules/
├── stores/
└── routes/
    └── Routes.jsx
public/
├── manifest.json
└── assets/
```

### 0.5 Global Styles & Fonts

In `index.css`, apply the design preferences:

- Load Montserrat Variable and Nunito Variable from Google Fonts (via `<link>` in `index.html`)
- `html { font-size: 100%; }` — never override root font size
- `body { font-size: clamp(1rem, 0.9rem + 0.5vw, 1.25rem); }` — fluid typography
- Spacing scale as CSS custom properties (`--space-xs` through `--space-3xl`)
- Accent color: `--accent: #7ec0d0`
- Line height `>= 1.5`, letter spacing `>= 0.12em`

### 0.6 Routing Shell

Set up `react-router` BrowserRouter in `index.jsx`, with three routes:

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | `OnboardingPage` | API key entry (redirects to `/library` if key exists) |
| `/library` | `LibraryPage` | Book grid |
| `/read/:book_id` | `ReaderPage` | The e-reader |

Wrap with `QueryParamProvider` from `use-query-params` for URL state.

### 0.7 Zustand Stores

**`settings_store.js`** — persisted to localStorage:

```js
{
    api_key: null,
    model: `openai/gpt-4o-mini`,
    font_size: 18,
    font_family: `Nunito Variable`,
    theme: `light`,          // light | dark | sepia
    last_language: `es`,
    last_level: `a2`
}
```

Use zustand's `persist` middleware with `localStorage` as storage.

**`library_store.js`** — persisted to IndexedDB:

```js
{
    books: [],               // array of book metadata objects
    add_book: fn,
    remove_book: fn,
    get_book: fn
}
```

Book file blobs live in IndexedDB. The store keeps metadata in sync.

---

**Checkpoint 0** — Verify:
- `npm run dev` starts the app on `:5173`
- Routes render placeholder text for each page
- `npm run lint` passes
- `npm run build` succeeds

---

## Phase 1: API Key Onboarding

### 1.1 OnboardingPage

Build `src/components/pages/OnboardingPage.jsx`:

- Centered card with app title "Gratis Reader" and accent-colored heading
- Single text input for the OpenRouter API key
- "Connect" button
- Loading state while validating

### 1.2 API Key Validation

In `src/modules/open_router.js`, implement:

```js
/**
 * Validates an OpenRouter API key by calling the /auth/key endpoint
 * @param {string} api_key
 * @returns {Promise<boolean>}
 */
export const validate_api_key = async ( api_key ) => {
    const response = await fetch( `https://openrouter.ai/api/v1/auth/key`, {
        headers: { 'Authorization': `Bearer ${ api_key }` }
    } )
    return response.ok
}
```

### 1.3 Key Storage & Redirect

On successful validation:
- Store key in `settings_store` (which persists to localStorage)
- Navigate to `/library`

On app load, if key already exists in store, redirect `/` → `/library`.

### 1.4 Dev Shortcut

During development, if `import.meta.env.VITE_OPENROUTER_API_KEY` is set, auto-populate the input field with it. This way we can quickly bypass onboarding during testing.

---

**Checkpoint 1** — Verify:
- Landing on `/` shows the API key form
- Entering an invalid key shows an error toast
- Entering the real key from `.env` validates and redirects to `/library`
- Refreshing on `/library` does NOT redirect back to `/` (key persisted)
- Manually test in browser via MCP: inspect the form, submit the key, confirm redirect

---

## Phase 2: Book Library

### 2.1 IndexedDB Layer

Build `src/modules/cache.js` — a thin wrapper around IndexedDB for two object stores:

| Store | Purpose |
|-------|---------|
| `books` | Book metadata + file blobs |
| `translations` | Translation cache entries |

Use raw IndexedDB (no library). Expose:

```js
open_db()                           // → IDBDatabase
save_book( book_record )            // → void
get_all_books()                     // → Book[]
get_book( id )                      // → Book
delete_book( id )                   // → void
save_translation( cache_entry )     // → void
get_translation( cache_key )        // → string | null
clear_translations()                // → void
```

### 2.2 EPUB Parser Module

Build `src/modules/epub_parser.js`:

```js
/**
 * Parses an EPUB file and extracts metadata + content structure
 * @param {ArrayBuffer} array_buffer - The EPUB file data
 * @returns {Promise<Object>} { metadata, chapters, cover_url }
 */
export const parse_epub = async ( array_buffer ) => { ... }
```

Uses `epubjs`:
- `ePub( array_buffer )` to create book instance
- `await book.loaded.metadata` for title, creator, language
- `await book.coverUrl()` for cover image
- `book.navigation.toc` for chapter list
- `book.spine.spineItems` for ordered content access

Also implement content extraction per chapter:

```js
/**
 * Extracts text content from a single spine item
 * @param {Object} book - The epubjs Book instance
 * @param {Object} spine_item - A spine item from book.spine.spineItems
 * @returns {Promise<Object>} { html, text, paragraphs }
 */
export const extract_chapter_content = async ( book, spine_item ) => { ... }
```

Each chapter's content is split into paragraphs, and each paragraph into sentences.

### 2.3 Sentence Splitter

Build `src/modules/sentence_splitter.js`:

```js
/**
 * Splits text into sentences, handling common abbreviations and edge cases
 * @param {string} text - Raw paragraph text
 * @returns {string[]} Array of sentences
 */
export const split_sentences = ( text ) => { ... }
```

Strategy: split on `.`, `!`, `?` followed by whitespace and a capital letter, while handling:
- Abbreviations (Mr., Dr., e.g., i.e., etc.)
- Numbers with decimals (3.14)
- Quoted speech ("Hello. How are you?" is one unit if inside quotes)
- Ellipses (...)

This does NOT need to be perfect — it's a heuristic for chunking, not NLP tokenisation.

### 2.4 Book Upload Flow

**`FileUploader.jsx`** (molecule):
- Drag-and-drop zone with a file input fallback
- Accepts `.epub` files (MOBI is out of scope for v1 — parsing libraries are unreliable)
- On file drop:
  1. Read file as `ArrayBuffer`
  2. Generate book ID by hashing the first 8KB with `crypto.subtle.digest('SHA-256', ...)`
  3. Parse with `parse_epub()`
  4. Store in IndexedDB: metadata + file blob
  5. Update `library_store`
  6. Show success toast

### 2.5 LibraryPage

**`LibraryPage.jsx`** (page):
- Header: "Gratis Reader" title + settings icon (top-right)
- Book grid: cards showing cover, title, author
- Empty state: illustration/text + upload prompt
- Upload button (opens `FileUploader`)
- Each book card: click → navigate to `/read/:book_id`
- Delete action: long-press or explicit delete button with confirmation

**`BookCard.jsx`** (molecule):
- Cover image (or placeholder gradient if no cover)
- Title and author text
- Click handler to open

### 2.6 Pre-load Demo Book

For development convenience, add a utility that checks if `book.epub` is available at `/book.epub` (served from `public/`) and offers to load it. This helps during testing — copy `book.epub` into `public/` during development.

---

**Checkpoint 2** — Verify:
- Library page renders empty state when no books are uploaded
- Drag-dropping `book.epub` onto the upload zone parses it and shows the book card
- Book card shows the correct title ("Smart work beats hard work") and author ("Mentor Palokaj")
- Clicking the book card navigates to `/read/:book_id`
- Refreshing the page preserves the book (IndexedDB persistence)
- Deleting a book removes it from the grid
- E2E test: upload file via Playwright's `FileChooser`, assert book appears
- MCP browser test: visually inspect the library grid, card layout, empty state

---

## Phase 3: EPUB Reader (Original Language)

Before tackling translation, build the reader showing original English text. This validates the rendering pipeline independently.

### 3.1 Book Loading Hook

Build `src/hooks/use_book.js`:

```js
/**
 * Hook that loads a book from IndexedDB and provides navigation
 * @param {string} book_id
 * @returns {{ book, chapters, current_chapter, current_page, go_to_page, next_page, prev_page, progress, loading }}
 */
export const use_book = ( book_id ) => { ... }
```

Internally:
- Load book blob from IndexedDB
- Create `ePub( array_buffer )` instance
- Load spine items and extract chapter content (text + HTML structure)
- Split chapter content into paragraphs and sentences using `sentence_splitter.js`
- Track current chapter index and scroll-based progress via `IntersectionObserver`
- Expose navigation: `next_chapter()`, `prev_chapter()`, `go_to_chapter( index )`

### 3.2 ReaderPage Layout

**`ReaderPage.jsx`** (page):

```
┌──────────────────────────────────┐
│  ← Back    Chapter Title    ⚙️   │  ← header bar
├──────────────────────────────────┤
│                                  │
│    [Book content area]           │  ← main reading area
│                                  │
│    rendered by epubjs or         │
│    custom sentence renderer      │
│                                  │
├──────────────────────────────────┤
│  ◀  ────────── 34% ──────────▶  │  ← progress bar + nav
└──────────────────────────────────┘
```

Two rendering strategies to consider:

**Strategy A — epubjs rendition (iframe)**:
- Use `book.renderTo( element, { flow: 'paginated' } )`
- Pros: handles pagination, CSS, images natively
- Cons: hard to intercept individual sentences for tap/hover/tooltip — content is inside an iframe

**Strategy B — Custom renderer (recommended)**:
- Extract chapter HTML, parse it, split into sentences, render as React components
- Each sentence is a `<Sentence>` component with tap/hover/long-press handlers
- Pagination is done by measuring rendered height against viewport
- Pros: full control over sentence interaction
- Cons: must handle images, headings, lists ourselves

**Decision: Strategy B.** The sentence-level interactions (tap, hover, long-press) are the core UX — they require full DOM control. Using epubjs's iframe renderer would make these interactions extremely difficult to wire up.

Use epubjs only for **parsing** (metadata, spine, content extraction). Rendering is custom React.

### 3.3 Custom Page Renderer

The rendering pipeline:

```
spine_item → load HTML → parse DOM → extract elements →
  headings  → render as <h1>, <h2>, etc.
  paragraphs → split into sentences → render as <Sentence> components
  lists → split list items into sentences → render
  images → render as <img> with blob URLs
```

**Pagination**: after rendering a chapter's content into a hidden measuring container, calculate page breaks based on viewport height. Store page boundaries as sentence index ranges.

Actually, a simpler approach: **scrolled view with virtual pages**. Render the full chapter as a scrollable column, but track "pages" as viewport-height chunks for the progress indicator and read-ahead calculation. The user scrolls naturally, but we know which sentences are "on screen" via an `IntersectionObserver`.

This avoids complex pagination math while still supporting the 2-page read-ahead buffer.

### 3.4 Sentence Component (Original Only)

**`Sentence.jsx`** (molecule):

For this phase, just render each sentence as a `<span>` with a data attribute for its sentence ID. No interaction handlers yet — those come in Phase 4.

```jsx
const Sentence = ( { sentence_id, text } ) =>
    <span data-sentence-id={ sentence_id }>{ text }</span>
```

### 3.5 Chapter Navigation

- Table of contents sidebar/dropdown to jump between chapters
- Next/previous page controls (tap left/right edges or arrow keys)
- Progress bar at the bottom showing `location.start.percentage`

### 3.6 Reader Settings Drawer

**`SettingsDrawer.jsx`** (molecule):

Slide-in panel from the right, triggered by the gear icon. For now, implement only the display settings:

| Setting | Implementation |
|---------|---------------|
| Font size | Slider, 12–32px, stored in `settings_store` |
| Font family | Dropdown: Nunito Variable, Georgia, Merriweather, system-ui |
| Theme | Three buttons: Light / Dark / Sepia |

Language and level selectors are added in Phase 4.

Apply settings via CSS custom properties on the reader container.

---

**Checkpoint 3** — Verify:
- Opening a book renders the first chapter's text in original English
- Scrolling through the chapter shows all content (headings, paragraphs, lists)
- Chapter navigation works (TOC dropdown or next/prev)
- Progress indicator updates as you scroll
- Font size, font family, and theme changes apply immediately
- Back button returns to the library
- E2E test: open book, assert chapter heading visible, navigate to next chapter
- MCP browser test: scroll through content, check typography matches design preferences (line length, spacing), verify theme switching

---

## Phase 4: Translation Engine

The core feature. This phase adds language selection, the LLM translation pipeline, and sentence-level caching.

### 4.1 Prompt Templates

Build `src/modules/prompts.js`:

```js
/**
 * Builds the system prompt for sentence translation
 * @param {string} source_language
 * @param {string} target_language
 * @param {string} cefr_code - e.g. 'a1', 'b2'
 * @param {string} level_label - e.g. 'Toddler', 'High Schooler'
 * @returns {string}
 */
export const build_translation_system_prompt = ( source_language, target_language, cefr_code, level_label ) => { ... }

/**
 * Builds the user message for translating a single sentence with context
 * @param {string} sentence - The target sentence to translate
 * @param {string} context - The surrounding paragraph for coherence
 * @returns {string}
 */
export const build_translation_user_prompt = ( sentence, context ) => { ... }

/**
 * Builds the prompt for explaining a translation (long-press feature)
 * @param {string} source_language
 * @param {string} target_language
 * @param {string} level_label
 * @param {string} original_sentence
 * @param {string} translated_sentence
 * @returns {Object} { system, user } message pair
 */
export const build_explanation_prompt = ( source_language, target_language, level_label, original_sentence, translated_sentence ) => { ... }
```

#### System Prompt — Translation

The system prompt is the most critical piece. It must be precise enough that the LLM returns ONLY the translated sentence — no quotes, no preamble, no explanation.

```
You are a language adaptation specialist. You rewrite text from
{source_language} into {target_language} at a specific proficiency level.

Current level: {level_label} ({cefr_code})

Level behaviour:
- A1 (Toddler): Use only the ~500 most common words in {target_language}.
  Sentences must be under 8 words. No idioms, metaphors, or subordinate
  clauses. Convey only the core meaning. It is fine to drop detail.
  Example: "The architecture inspired his soul" → "It was beautiful"

- A2 (Primary Schooler): Use basic vocabulary (~1500 words). Simple sentence
  structure with basic conjunctions (and, but, because). Lightly simplify
  complex ideas but keep the main point.

- B1–B2 (High Schooler): Use moderate vocabulary. Compound and complex
  sentences are fine. Preserve the main meaning but simplify obscure idioms
  and cultural references. Approximate literary style.

- C1–C2 (Adult): Full vocabulary and natural expression. Preserve style,
  tone, literary devices, and nuance. This should read like a professional
  translation.

Rules:
1. Output ONLY the translated/rewritten sentence
2. No quotes around the output
3. No explanations, notes, or comments
4. No markup or formatting
5. If the sentence is a heading or title, translate it maintaining its brevity
6. Maintain the same punctuation style (periods, question marks, etc.)
```

#### User Message — Translation

```
Context (for reference only — do NOT translate this):
"""
{paragraph_text}
"""

Translate this sentence:
{sentence}
```

#### System Prompt — Explanation (Long Press)

```
You are a language teacher explaining a translation to a student who is
learning {target_language}. The student's native language is {source_language}.
They are at the {level_label} level.

Given an original sentence and its adapted translation, explain:
1. A phrase-by-phrase mapping between original and translation
2. Why specific words or phrases were changed or simplified
3. Key grammar points visible in the translation
4. Any nuance or cultural context that was lost or changed

Write your explanation in {source_language} since the student is still
learning. Keep it concise — under 200 words.
```

### 4.2 OpenRouter Client

Build `src/modules/open_router.js` (extending the validate function from Phase 1):

```js
/**
 * Sends a chat completion request to OpenRouter
 * @param {Object} options
 * @param {string} options.api_key
 * @param {string} options.model
 * @param {string} options.system_prompt
 * @param {string} options.user_message
 * @param {AbortSignal} [options.signal] - For request cancellation
 * @returns {Promise<string>} The assistant's response text
 */
export const chat_completion = async ( { api_key, model, system_prompt, user_message, signal } ) => {

    const response = await fetch( `https://openrouter.ai/api/v1/chat/completions`, {
        method: `POST`,
        headers: {
            'Authorization': `Bearer ${ api_key }`,
            'Content-Type': `application/json`,
            'X-Title': `Gratis Reader`
        },
        body: JSON.stringify( {
            model,
            messages: [
                { role: `system`, content: system_prompt },
                { role: `user`, content: user_message }
            ],
            temperature: 0.3    // Low temperature for consistent translations
        } ),
        signal
    } )

    if( !response.ok ) throw new Error( `OpenRouter error: ${ response.status }` )

    const { choices } = await response.json()
    return choices[0].message.content.trim()
}
```

**Temperature note**: use `0.3` for translations (consistency) and `0.7` for explanations (more natural teaching tone).

### 4.3 Translation Cache

Extend `src/modules/cache.js` with the `translations` object store (from Phase 2):

Cache key format: `{sentence_id}:{language}:{level}`

Example: `a1b2c3:4:2:7:sq:a1` → `book_hash:chapter:paragraph:sentence:language:level`

### 4.4 Translation Hook

Build `src/hooks/use_translation.js`:

```js
/**
 * Hook that manages translation of visible sentences with read-ahead
 * @param {Object} options
 * @param {Array} options.sentences - All sentences in current chapter
 * @param {Array} options.visible_sentence_ids - Currently visible sentence IDs
 * @param {string} options.target_language
 * @param {string} options.level
 * @param {string} options.source_language
 * @returns {{ translations, is_translating, translation_progress }}
 */
export const use_translation = ( { sentences, visible_sentence_ids, target_language, level, source_language } ) => { ... }
```

Internal logic:

1. **Determine scope**: take visible sentences + estimate the next 2 "pages" worth of sentences (roughly: the next `N` sentences where `N` = average sentences per viewport × 2)
2. **Check cache**: for each sentence in scope, check IndexedDB
3. **Queue misses**: sentences not in cache go into a translation queue
4. **Process queue**: translate sentences concurrently (max 3–5 parallel requests to avoid rate limits)
5. **Store results**: write each translation to IndexedDB as it arrives
6. **Cancellation**: when `visible_sentence_ids` changes (user navigated), cancel in-flight requests via `AbortController` and recompute scope
7. **Return state**: a map of `{ [sentence_id]: translated_text }` + loading indicators

Use `useRef` for the `AbortController` and `useEffect` cleanup to cancel on unmount or dependency change.

### 4.5 Language & Level Pickers

**`LanguagePicker.jsx`** (molecule):
- Searchable dropdown
- Common languages at the top: Spanish, French, German, Italian, Portuguese, Chinese, Japanese, Korean, Albanian, Arabic, Russian, Hindi
- Free text input for any language not in the list

**`LevelPicker.jsx`** (molecule):
- Four buttons/cards, each showing:
  - CEFR code (A1, A2, B1–B2, C1–C2)
  - Friendly label (Toddler, Primary Schooler, High Schooler, Adult)
  - One-line example translation
- Selected level is visually highlighted with the accent color

Add both to the `SettingsDrawer`. When either changes:
- Update `settings_store` (`last_language`, `last_level`)
- Clear all in-memory translations (keep the IndexedDB cache — it's keyed by language+level so old entries don't conflict)
- Trigger re-translation of visible sentences

### 4.6 Wire Translation into the Reader

In `ReaderPage.jsx`:
1. Compute `visible_sentence_ids` using `IntersectionObserver`
2. Pass to `use_translation` hook along with language/level from `settings_store`
3. For each `<Sentence>`, pass both `original_text` and `translated_text`
4. If translated text is available, show it; otherwise show a skeleton loading state
5. If offline and no cache hit, show original text with a subtle "untranslated" indicator

### 4.7 First-Open Language Selection

When a user opens a book for the first time:
- Show a modal/overlay asking them to select a target language and proficiency level
- Pre-fill with `last_language` and `last_level` from settings if available
- "Start reading" button dismisses the modal and begins translation

On subsequent opens of the same book, use the last-used settings (skip the modal).

---

**Checkpoint 4** — This is the most critical checkpoint. Verify:
- Opening the demo book shows a language/level selection modal
- Selecting Spanish + A1 (Toddler) triggers translation
- Translated text appears sentence by sentence as API responses arrive
- Skeleton loaders show during translation
- Changing level to C1–C2 (Adult) produces noticeably more complex translations
- Changing language to French re-translates with French text
- Navigating to the next chapter triggers new translations
- Refreshing the page and reopening the same book serves translations from cache (no API calls)
- E2E tests:
  - Mock OpenRouter responses with `page.route()` for deterministic testing
  - Assert translated text appears after mock response
  - Assert cache hit: second load doesn't trigger API calls
  - Assert level change triggers re-translation
- MCP browser test:
  - Open the book with real OpenRouter API key from `.env`
  - Select Albanian + A1, read through a few pages
  - Verify translations are genuinely simplified
  - Switch to C1–C2 and compare the same page — should be much more complex
  - Check the network tab to confirm caching (second page load = no API calls for already-translated sentences)

---

## Phase 5: Sentence Interactions

### 5.1 Tap to Toggle

Upgrade `Sentence.jsx`:

- Track `is_showing_original` state per sentence (local state, not global)
- On click/tap: toggle between translated and original text
- Animate the swap with a subtle fade transition (200ms, `ease`)
- When showing original: apply a soft background highlight (`rgba(126, 192, 208, 0.1)`) so the user knows this sentence is in "original mode"

```jsx
const Sentence = ( { sentence_id, original, translated, ... } ) => {

    const [ showing_original, set_showing_original ] = useState( false )

    const toggle = () => set_showing_original( prev => !prev )

    return <SentenceSpan
        onClick={ toggle }
        $highlighted={ showing_original }
    >
        { showing_original ? original : ( translated || original ) }
    </SentenceSpan>
}
```

### 5.2 Word Hover Tooltip

**`Tooltip.jsx`** (atom):
- Positioned above the hovered word
- Shows the original-language equivalent
- Arrow pointing to the word
- Appears on `mouseenter` (desktop), disappears on `mouseleave`
- On mobile: no hover — skip this interaction (tap-to-toggle covers the use case)

**Word wrapping**: each word in a translated sentence needs to be a hoverable `<span>`. Wrap translated text during rendering:

```jsx
const rendered_words = translated.split( /(\s+)/ ).map( ( word, i ) =>
    word.trim()
        ? <HoverableWord key={ i } word={ word } sentence_id={ sentence_id } />
        : word
)
```

**Word translation lookup**:
- On hover, check cache first (key: `{word}:{source_lang}:{target_lang}`)
- On cache miss, make a lightweight LLM call:
  - System: "You are a dictionary. Given a word in {target_language}, respond with the most likely equivalent in {source_language}. Respond with ONLY the word."
  - User: "{word}" (with sentence context for disambiguation)
- Cache the result in IndexedDB
- Show a tiny loading spinner in the tooltip while waiting

### 5.3 Long Press Explanation Popover

**`ExplanationPopover.jsx`** (molecule):

Trigger: long-press (500ms hold) on desktop and mobile, OR right-click on desktop.

Implementation:
- `onMouseDown` / `onTouchStart`: start a 500ms timer
- `onMouseUp` / `onTouchEnd` / `onMouseLeave`: cancel the timer
- If timer fires: open the popover, prevent the tap-to-toggle from also firing
- Right-click (`onContextMenu`): open the popover, `preventDefault()`

Popover content (loaded on demand):
1. **Original**: the source sentence
2. **Translation**: the adapted sentence
3. Loading skeleton while LLM generates the explanation
4. **Explanation**: phrase-by-phrase breakdown, grammar notes, simplification rationale

Use `build_explanation_prompt()` from `prompts.js` and `chat_completion()` with `temperature: 0.7`.

**Popover UI**:
- Centered modal overlay on mobile (bottom sheet style)
- Positioned popover near the sentence on desktop
- Close on outside click or explicit close button
- Smooth entry animation (200–350ms, `ease-out`)

### 5.4 Interaction Conflict Resolution

Three interactions compete on the same `<Sentence>` element:
- **Tap** (< 200ms): toggle original/translated
- **Long press** (>= 500ms): open explanation popover
- **Hover** (desktop only): word tooltip

Resolution strategy:
- Use a `useRef` timer for long-press detection
- On `mousedown`/`touchstart`: start the timer
- On `mouseup`/`touchend` before 500ms: it's a tap → toggle
- On timer fire at 500ms: it's a long press → open popover, set a flag to suppress the upcoming `mouseup` toggle
- Hover is independent — only fires on `mouseenter` of individual word spans

---

**Checkpoint 5** — Verify:
- Tapping a translated sentence swaps to original English
- Tapping again swaps back to translated
- Toggled sentences have a visible highlight
- Hovering a word (desktop) shows a tooltip with the original word
- Tooltip disappears when mouse leaves
- Long-pressing a sentence opens the explanation popover
- Popover shows original, translated, and a generated explanation
- Popover closes on outside click
- Tap and long-press don't conflict (tap toggles, long-press opens popover, never both)
- E2E tests:
  - Click sentence → assert text changes to original
  - Click again → assert text changes back to translated
  - Hover word → assert tooltip visible with text
  - Mouse down 600ms + mouse up → assert popover visible
  - Assert popover contains original and translated text
- MCP browser test:
  - With real API: tap sentences, verify toggle
  - Hover words in the translated text, check tooltip content makes sense
  - Long-press a sentence, read the explanation, verify it's educational and accurate
  - Test on a mobile viewport: verify tap and long-press work without hover

---

## Phase 6: PWA & Offline

### 6.1 PWA Manifest

Configure `vite-plugin-pwa` in `vite.config.js`:

```js
{
    registerType: `autoUpdate`,
    manifest: {
        name: `Gratis Reader`,
        short_name: `Gratis Reader`,
        description: `Language-learning e-reader`,
        theme_color: `#7ec0d0`,
        background_color: `#ffffff`,
        display: `standalone`,
        icons: [ /* generate from a base icon */ ]
    },
    workbox: {
        globPatterns: [ `**/*.{js,css,html,woff2}` ],
        runtimeCaching: [
            {
                urlPattern: /^https:\/\/fonts\.googleapis\.com/,
                handler: `StaleWhileRevalidate`
            }
        ]
    }
}
```

### 6.2 Offline Banner

When the app detects no network (`!navigator.onLine` or fetch failures):
- Show a subtle top banner: "Offline — showing cached translations"
- Use the accent color at reduced opacity
- Auto-dismiss when connection restores

### 6.3 Service Worker

`vite-plugin-pwa` handles the service worker generation. The app shell (HTML, JS, CSS, fonts) is pre-cached. IndexedDB (books, translations) is already client-side and available offline.

---

**Checkpoint 6** — Verify:
- `npm run build` generates a `dist/` with `manifest.webmanifest` and `sw.js`
- Serving the build (`npm run preview`) shows the app
- Chrome DevTools → Application → Manifest shows correct metadata
- Chrome DevTools → Application → Service Workers shows active SW
- Simulating offline in DevTools still loads the app shell
- Previously cached translations display offline
- Uncached pages show original text with "offline" indicator
- E2E test: use `context.setOffline(true)`, navigate to a cached page, assert content visible

---

## Phase 7: Polish & Edge Cases

### 7.1 Loading States

- **Library**: skeleton cards while IndexedDB loads
- **Reader**: skeleton lines while chapter content parses
- **Translation**: per-sentence skeleton shimmer while API responds
- **Explanation popover**: skeleton block while explanation generates

Use a shared `Skeleton.jsx` atom with configurable width/height.

### 7.2 Error Handling

- **API key invalid/expired**: toast + redirect to onboarding
- **OpenRouter rate limit**: exponential backoff with toast "Translating slowly — rate limited"
- **OpenRouter error**: toast with error message, skip sentence (show original)
- **EPUB parse failure**: toast "Could not read this file", stay on library
- **IndexedDB full**: toast warning, translations still work (just not cached)

### 7.3 Keyboard Navigation

- `←` / `→` arrow keys: previous/next page
- `Escape`: close popover, close settings drawer
- `Space`: scroll down (default browser behavior, don't override)

### 7.4 Mobile Responsiveness

- Library grid: 2 columns on mobile, 3–4 on tablet, 4–6 on desktop
- Reader: full-width reading area, `.prose { max-width: 65ch }` for readability
- Settings drawer: full-screen on mobile, side panel on desktop
- Touch targets: minimum 44×44pt for all interactive elements
- Popover: bottom sheet on mobile, positioned popover on desktop

### 7.5 Reading Progress Persistence

Save the user's last position per book in IndexedDB:

```js
{ book_id, chapter_index, scroll_position, last_read_at }
```

On reopening a book, restore position. Show a "Continue from where you left off?" prompt if the saved position is not page 1.

---

**Checkpoint 7** — Verify:
- All loading states display properly (no layout shifts, no flashes of unstyled content)
- Error states show helpful toasts and don't crash the app
- Keyboard navigation works on desktop
- Mobile layout is usable at 375px width
- Reading progress is saved and restored
- MCP browser test: resize viewport to mobile, test full flow (upload, open, translate, interact)

---

## Phase 8: E2E Test Suite (Playwright)

### 8.1 Test Configuration

`playwright.config.js`:

```js
import { defineConfig, devices } from '@playwright/test'

export default defineConfig( {

    testDir: `./tests`,
    timeout: 60_000,              // translations can be slow
    expect: { timeout: 15_000 },  // allow time for API responses

    use: {
        baseURL: `http://localhost:5173`,
        trace: `on-first-retry`,
        screenshot: `only-on-failure`
    },

    webServer: {
        command: `npm run dev`,
        url: `http://localhost:5173`,
        reuseExistingServer: !process.env.CI
    },

    projects: [
        { name: `chromium`, use: { ...devices['Desktop Chrome'] } },
        { name: `mobile`, use: { ...devices['Pixel 5'] } }
    ]

} )
```

### 8.2 Test Fixtures & Helpers

`tests/helpers/setup.js`:

```js
// Injects API key into localStorage before each test
export const setup_api_key = async ( page ) => {
    const api_key = process.env.VITE_OPENROUTER_API_KEY
    await page.goto( `/` )
    await page.evaluate( ( key ) => {
        const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
        store.state = { ...store.state, api_key: key }
        localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
    }, api_key )
}

// Uploads the demo book and waits for it to appear in the library
export const upload_demo_book = async ( page ) => {
    await page.goto( `/library` )
    const chooser_promise = page.waitForEvent( `filechooser` )
    await page.getByRole( `button`, { name: /upload|add/i } ).click()
    const chooser = await chooser_promise
    await chooser.setFiles( `./book.epub` )
    await page.getByText( `Smart work beats hard work` ).waitFor()
}
```

Copy `book.epub` to `tests/fixtures/book.epub` as a test fixture.

### 8.3 Test Suites

**`tests/onboarding.spec.js`** — API Key Flow:

```
✓ shows onboarding page when no API key is stored
✓ validates and rejects an invalid API key
✓ accepts a valid API key and redirects to library
✓ persists the key across page reloads
✓ redirects to library on load if key already exists
```

**`tests/library.spec.js`** — Book Library:

```
✓ shows empty state when no books are uploaded
✓ uploads an EPUB file via file chooser
✓ displays book title and author after upload
✓ persists books across page reloads (IndexedDB)
✓ opens a book when clicking the book card
✓ deletes a book with confirmation
```

**`tests/reader.spec.js`** — Reader (Original Text):

```
✓ renders the first chapter heading
✓ displays paragraph text from the book
✓ navigates to the next chapter
✓ shows a progress indicator
✓ back button returns to the library
```

**`tests/translation.spec.js`** — Translation Engine:

Two modes: **mocked** (fast, deterministic) and **live** (slow, real API).

Mocked tests (default):
```
✓ requests translation from OpenRouter when page loads
✓ displays translated text when API responds
✓ shows skeleton loaders while translating
✓ caches translations in IndexedDB
✓ serves cached translations on second load (no API call)
✓ re-translates when language changes
✓ re-translates when level changes
✓ cancels in-flight requests when navigating away
```

Live tests (run with `LIVE_API=1 npx playwright test --grep @live`):
```
✓ @live translates first page to Spanish at A1 level
✓ @live translations are genuinely simplified at A1 vs C2
✓ @live translations are in the correct target language
```

Mock strategy for mocked tests:

```js
await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
    const body = JSON.parse( route.request().postData() )
    const sentence = body.messages[1].content.match( /Translate this sentence:\n(.+)/ )?.[1]
    await route.fulfill( {
        json: {
            choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ]
        }
    } )
} )
```

**`tests/interactions.spec.js`** — Sentence Interactions:

```
✓ tap toggles sentence between translated and original
✓ toggled sentence has a visible highlight
✓ second tap restores the translated version
✓ hover on a word shows tooltip (desktop)
✓ tooltip disappears on mouse leave
✓ long press (500ms) opens explanation popover
✓ popover shows original and translated sentence
✓ popover closes on outside click
✓ tap and long press don't conflict
```

**`tests/settings.spec.js`** — Settings:

```
✓ settings drawer opens from gear icon
✓ font size change applies to reader text
✓ theme change applies correct colors
✓ language change triggers re-translation
✓ level change triggers re-translation
```

**`tests/offline.spec.js`** — Offline:

```
✓ app shell loads when offline
✓ cached translations display when offline
✓ offline banner appears when network is unavailable
✓ banner disappears when network returns
```

### 8.4 Running Tests

Add npm scripts:

```json
{
    "test": "npx playwright test",
    "test:live": "LIVE_API=1 npx playwright test --grep @live",
    "test:headed": "npx playwright test --headed",
    "test:debug": "npx playwright test --debug"
}
```

---

## Phase 9: Manual Browser Testing (MCP)

### 9.1 MCP Server Setup

Install the Playwright MCP server for AI-driven browser control:

```bash
npx @playwright/mcp@latest
```

Configure in the Claude Code settings or invoke directly. This gives the AI agent the ability to:
- Navigate to URLs
- Click, type, hover, scroll
- Take screenshots
- Inspect elements
- Emulate devices

### 9.2 Manual Test Script

Run through these scenarios with the browser MCP, using the real OpenRouter API key from `.env`:

#### Flow 1: First-Time User Experience
1. Open `http://localhost:5173`
2. **Screenshot**: verify onboarding page layout (centered card, clean design)
3. Enter the API key from `.env`
4. Click "Connect"
5. **Screenshot**: verify redirect to library, empty state
6. Upload `book.epub` using the file picker
7. **Screenshot**: verify book card appears with correct title/author/cover

#### Flow 2: Reading & Translation
1. Click the book card to open the reader
2. Select Albanian as target language, A1 (Toddler) as level
3. **Screenshot**: verify translation loading skeletons
4. Wait for translations to complete
5. **Screenshot**: verify translated text is visible, simplified Albanian
6. Scroll down to see more content
7. **Screenshot**: verify read-ahead translations load smoothly

#### Flow 3: Sentence Interactions
1. Click a translated sentence
2. **Screenshot**: verify it toggles to English original with highlight
3. Click again to toggle back
4. Hover over individual words in the translated text
5. **Screenshot**: verify tooltip appears with English equivalent
6. Long-press (hold click for 500ms+) a sentence
7. **Screenshot**: verify explanation popover with phrase breakdown

#### Flow 4: Level Comparison
1. Open settings, switch to C1–C2 (Adult)
2. Wait for re-translation
3. **Screenshot**: compare the same page — translations should be much more complex
4. Switch to A1 (Toddler)
5. **Screenshot**: verify dramatic simplification

#### Flow 5: Settings & Display
1. Open settings drawer
2. Increase font size to maximum
3. **Screenshot**: verify text reflows properly
4. Switch to dark theme
5. **Screenshot**: verify dark theme looks correct (contrast ratios)
6. Switch to sepia theme
7. **Screenshot**: verify sepia theme

#### Flow 6: Mobile Viewport
1. Emulate a Pixel 5 device (393×851)
2. Repeat Flow 1–3 at mobile size
3. **Screenshot**: verify responsive layout at each step
4. Verify touch targets are >= 44×44pt

#### Flow 7: Offline Behaviour
1. Translate a few pages with network enabled
2. Go offline (disconnect network)
3. Navigate to a previously translated page
4. **Screenshot**: verify cached translations display, offline banner visible
5. Navigate to an untranslated page
6. **Screenshot**: verify original text shown with "untranslated" indicator
7. Reconnect network
8. **Screenshot**: verify banner disappears, new translations resume

---

## Implementation Order Summary

| Phase | Scope | Key Deliverable |
|-------|-------|-----------------|
| 0 | Scaffolding | Vite + React + routing + stores + styles |
| 1 | Onboarding | API key validation and persistence |
| 2 | Library | EPUB upload, parsing, IndexedDB storage, book grid |
| 3 | Reader (original) | Custom sentence renderer, chapter navigation, display settings |
| 4 | Translation | LLM pipeline, prompts, caching, language/level selection |
| 5 | Interactions | Tap toggle, word tooltip, long-press explanation |
| 6 | PWA & offline | Service worker, manifest, offline fallback |
| 7 | Polish | Loading states, error handling, mobile, progress persistence |
| 8 | E2E tests | Playwright suite with mocked + live API tests |
| 9 | MCP testing | Manual browser inspection of all flows |

Each phase builds on the previous. Checkpoints after each phase catch issues early. The most complex phase is 4 (translation engine) — budget the most time there.

---

## Notes & Decisions

- **MOBI support is deferred.** Client-side MOBI parsing libraries are unreliable. EPUB covers the vast majority of ebooks. Users can convert MOBI → EPUB with Calibre.
- **Custom renderer over epubjs iframe.** The sentence-level interactions (tap, hover, long-press) require full DOM control. Using epubjs only for parsing, not rendering.
- **Scrolled view over paginated.** True pagination requires complex layout math. A scrolled view with `IntersectionObserver` for read-ahead is simpler and works better on variable screen sizes.
- **mentie is a runtime dependency.** It provides logging (`log.info`, `log.debug`, etc.) used throughout the app. Install it in Phase 0.
- **Temperature 0.3 for translation, 0.7 for explanation.** Translation needs consistency; explanation benefits from a more natural, varied tone.
- **Default model: `openai/gpt-4o-mini`** via OpenRouter. Cost-efficient (~$0.15/M input tokens) and fast. Configurable in settings for users who want to use other models.
