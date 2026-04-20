# Changelog

## [1.7.4] - 2026-04-20

### Changed
- Enforce 25 MiB size limit on Gutenberg epub downloads (uncommitted)
- Try noimages/older-format epub alternatives, then mobi, before skipping (uncommitted)
- Exclude oversized books from catalog JSON and clean up their files (uncommitted)

## [1.7.0] - 2026-04-20

### Added
- Multi-size WebP cover variants in Gutenberg script (xs/sm/md) (uncommitted)
- `--variants-only` flag to regenerate variants from cached covers (uncommitted)
- `npm run gutenberg:variants` convenience script (uncommitted)

## [1.6.0] - 2026-04-20

### Added
- Gutenberg Classic Library section on library page with 128 public domain books
- Book detail modal with summary, subjects, bookshelves, and metadata
- One-click import of Gutenberg books into user's library for reading

## [1.5.0] - 2026-04-02

### Added
- Token usage & cost display in reader footer (per-book, persisted in IDB)
- Model-aware cost estimation with common OpenRouter model pricing
- E2E tests: token display, read-ahead stress (9 new, 356 total)

### Changed
- `chat_completion` now returns `{ content, usage }` object (internal)

## [1.4.0] - 2026-04-02

### Added
- Translation read-ahead buffer: pre-translate next 2 chapters ahead
- E2E tests: state transitions, read-ahead, full round-trip (11 new, 347 total)

## [1.3.22] - 2026-04-02

### Fixed
- API key validation no longer swallows network errors (unreachable catch block)
- Settings key update shows network error toast instead of "invalid key"
- Settings key update shows toast on whitespace-only input (was silent)

### Added
- E2E tests: onboarding, network errors, settings key flows, reader resilience, full walkthrough (36 new, 336 total)

## [1.3.21] - 2026-04-02

### Fixed
- Add offline banner to library page (was only on reader page) (uncommitted)
- Remove test fixture book.epub leaked into public/ directory (uncommitted)

### Added
- E2E tests: offline banner, build hygiene, settings drawer, themes (8 new, 300 total)

## [1.3.20] - 2026-04-02

### Fixed
- Reject oversized EPUB uploads with 200MB file size limit (uncommitted)

### Added
- E2E tests: 53 new tests covering security, data flow, state transitions, production scenarios, cross-feature interactions, console warnings, API shapes, timing, error resilience (292 total)

## [1.3.19] - 2026-04-02

### Fixed
- Failed translation requests silently discarded with no logging
- Tooltip overflows viewport on narrow mobile screens (320px)

### Added
- E2E tests: error resilience, mobile tooltip, rapid nav, TOC, search, settings persistence, progress restore, overlay blocking, routing, levels, metadata (12 new, 239 total)

## [1.3.18] - 2026-04-02

### Fixed
- Word tooltip dismiss timer not cleaned on unmount (state update after unmount)
- Sentence splitter has no fallback for very long unpunctuated text (>500 chars)
- EPUB parser skips table elements instead of recursing into cells
- No Unicode NFC normalization on extracted text (cache key mismatches)
- IndexedDB opens a new connection on every operation (now cached)
- PWA manifest missing `start_url` field

### Added
- E2E tests: dismiss timer, long text split, NFC, IDB caching, manifest, navigation, settings, toggle, themes, deletion, onboarding (15 new, 227 total)

## [1.3.17] - 2026-04-02

### Fixed
- Add aria-label="Close" to settings drawer and explanation popover close buttons
- Add role="dialog" and aria-modal="true" to language selection modal

### Added
- E2E tests: aria-labels on close buttons, dialog role, accessible button names (5 new, 212 total)

## [1.3.16] - 2026-04-02

### Fixed
- npm install fails due to peer dependency conflicts (ERESOLVE)
- Downgrade @eslint/js from ^10 to ^9 (matches eslint 9)
- Downgrade globals from ^17 to ^15 (matches airier peer dep)
- Add overrides for vite-plugin-pwa to accept vite 8 (plugin works, peerDeps declaration behind)
- Remove duplicate "dept" entry in sentence splitter abbreviation list

### Added
- E2E tests: MOBI rejection, cover image, default model, level prompts, cache keys, explanation content, offline banner, language change, swipe nav, masked key, cache confirm, progress format, system prompt rules, toggle highlight, settings position (16 new, 207 total)

## [1.3.15] - 2026-04-02

### Fixed
- Sentence splitter now handles CJK punctuation (。！？) as sentence boundaries
- Mixed CJK/Latin text splits correctly at Latin periods before CJK chars
- OpenRouter API key validation has 15s timeout to prevent hanging
- OpenRouter chat completion has 60s fallback timeout when no signal provided
- OpenRouter JSON parse failure gives clear error instead of crash
- EPUB parser uses direct children for list items (fixes nested list flattening)
- Tooltip overflow protected with max-width, hidden overflow, and ellipsis
- Remove dead Unicode ellipsis check from sentence splitter

### Added
- E2E tests: CJK splitting, mixed scripts, API timeout/JSON safety, tooltip overflow, progress cleanup, overlay keyboard blocking, abbreviations, decimals, empty input (19 new, 191 total)

## [1.3.14] - 2026-04-02

### Fixed
- Arrow keys no longer navigate chapters when settings/explanation/language modal is open
- Model change in settings now propagates to translation effect (translate_batch in deps)
- Explanation popover closes when language or level changes in settings
- Empty chapter now shows message instead of blank reading area

### Added
- E2E tests: overlay keyboard blocking, model change, empty chapter, theme, navigation (22 new, 160 total)

## [1.3.13] - 2026-04-02

### Fixed
- Word tooltip now visible on mobile touch-and-hold (force_visible prop)
- TOC flattened from nested epubjs tree, dropdown matches by href not index
- EPUB upload validation is now case-insensitive (.EPUB, .Epub accepted)

### Added
- E2E tests: TOC labels, epub validation, word tooltip (115 total)

## [1.3.12] - 2026-04-02

### Fixed
- Destroy epubjs Book instance on unmount to prevent memory leaks
- API key Save/Cancel buttons now meet 44px touch target spec

## [1.3.11] - 2026-04-02

### Fixed
- EPUB parser skips script/style/noscript/svg/math/canvas/template tags
- Swipe navigation suppressed during long-press to prevent accidental chapter nav
- Chapter load failures now show user-visible error instead of blank page

### Added
- E2E tests: tag filtering, chapter error feedback, long-press stability (112 total)

## [1.3.10] - 2026-04-02

### Fixed
- Sentence splitter no longer breaks on initials like "J.K." or "U.S.A."
- Sentence splitter now splits on quote boundaries (e.g., 'said Bob. "How?"')
- Sepia theme accent color changed from cyan to warm goldenrod

### Added
- E2E tests: sepia accent color, sentence splitter initials (109 total)

## [1.3.9] - 2026-04-02

### Fixed
- Translation cache entries now properly cleaned on book delete (book_ prefix mismatch)
- Word lookup requests cancelled via AbortController on rapid hover and unmount

### Added
- E2E tests: cache cleanup on delete, word hover abort, level labels, progress accuracy (107 total)

## [1.3.8] - 2026-04-02

### Fixed
- Add .catch() on get_progress() to prevent app hang if IndexedDB fails
- Explanation popover now closes when navigating to a different chapter
- Guard against division-by-zero on empty spine in progress calculation
- Load Merriweather font from Google Fonts (was offered in settings but not loaded)

### Added
- E2E tests for popover-close-on-nav and Merriweather font (102 total)

## [1.3.7] - 2026-04-02

### Added
- E2E tests: offline banner, explanation popover content, model setting, drag-drop zone, chapter loading (100 total)

## [1.3.6] - 2026-04-02

### Fixed
- Theme validation rejects invalid values from corrupt localStorage
- Remove unused `visible_ids` parameter from translation hook

## [1.3.5] - 2026-04-02

### Fixed
- EPUB title fallback now strips `.epub` only at end of filename (regex)
- Drag-and-drop highlight no longer flickers on child elements (enter/leave counter)
- Concurrent file uploads blocked while one is already processing

### Added
- E2E tests for title fallback and upload guard (94 total)

## [1.3.4] - 2026-04-02

### Fixed
- Book deletion now cleans up orphaned translations and progress from IndexedDB
- Reading progress saved on tab close/navigation via pagehide handler
- TOC dropdown no longer overflows on narrow mobile viewports (320px)
- Long content no longer overflows reading area horizontally

### Added
- E2E test for deleted book redirect (92 total)

## [1.3.3] - 2026-04-02

### Fixed
- Catch-all route redirects unknown URLs instead of blank page
- Nonexistent book_id now redirects to library instead of loading forever
- React StrictMode race condition in book loading state
- Corrupt localStorage no longer crashes app on startup
- Timer cleanup on Sentence unmount prevents memory leaks

### Added
- E2E tests for route catch-all, missing book, corrupt storage (91 total)

## [1.3.2] - 2026-04-02

### Fixed
- Language default changed from code "es" to full name "Spanish"
- PWA manifest now references actual icon files (SVG + PNG 192/512)

### Added
- PWA icons: 192x192 and 512x512 PNG generated from SVG
- E2E tests for language default and PWA icon accessibility (88 total)

## [1.3.1] - 2026-04-02

### Fixed
- System prompt role now matches spec ("language teacher")
- Chapter loading indicator no longer stuck on missing spine item
- Unmount-safe async in reading progress restoration

### Added
- 35-test browser walkthrough covering all app flows (85 total)

## [1.3.0] - 2026-04-02

### Added
- Tap-edge chapter navigation — click left/right 12% of reading area
- E2E test for tap-edge navigation (51 total)

## [1.2.1] - 2026-04-01

### Added
- E2E tests for swipe nav, word hover, tap resilience, settings persistence (50 total)
- E2E tests for offline cache, font family change, invalid key rejection

### Fixed
- API key update in settings now validates before saving

## [1.2.0] - 2026-04-01

### Added
- Mobile word tooltips via touch-and-hold on translated words
- API key view (masked) and update in settings drawer
- Full-chapter translation (removed 50-sentence cap)
- E2E tests for level/language change and API key management (42 total)

### Fixed
- React hooks called after conditional early return in Sentence component

## [1.1.0] - 2026-04-01

### Added
- E2E test suite with Playwright (34 tests across 6 spec files)
- Swipe navigation for mobile chapter browsing
- Escape key returns to library from reader
- Richer progress display showing chapter position (X / Y · Z%)

### Fixed
- EPUB TOC pages rendering as garbled text (nav element not recursed)
- Missing space between adjacent sentences in reader
- Translation requests firing too rapidly during fast navigation (added 300ms debounce)
- Favicon 404 error (switched from missing .ico to .svg)

## [1.0.0] - 2026-04-01

### Added
- Onboarding flow with OpenRouter API key validation
- Book library with EPUB upload via drag-and-drop or file picker
- EPUB parsing with metadata extraction (title, author, cover, TOC)
- Custom sentence-level reader with chapter navigation
- LLM translation engine via OpenRouter with 4 proficiency levels (A1–C2)
- Translation caching in IndexedDB for offline access
- Tap-to-toggle between translated and original sentences
- Word hover tooltips with on-demand dictionary lookup
- Long-press explanation popover with phrase-by-phrase breakdown
- Settings drawer (font size, font family, theme, language, level, model)
- Three reading themes: light, dark, sepia
- Reading progress persistence per book
- Keyboard navigation (arrow keys for chapters, Escape to close)
- PWA support with service worker and offline banner
- Mobile-responsive layout with 44pt touch targets
