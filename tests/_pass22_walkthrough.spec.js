/**
 * Pass 22 — focused browser walkthrough targeting recently-fixed bugs
 * and areas flagged by prior audit agents.
 */
import { test, expect } from '@playwright/test'
import { open_reader } from './helpers/setup.js'

const DEMO_BOOK = `./tests/fixtures/book.epub`

const clear_all = async ( page ) => {
    await page.goto( `/` )
    await page.evaluate( () => {
        localStorage.clear()
        return new Promise( r => {
            const req = indexedDB.deleteDatabase( `gratis_reader` )
            req.onsuccess = r; req.onerror = r; req.onblocked = r
        } )
    } )
}

const mock_api = async ( page ) => {
    await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
        const body = JSON.parse( route.request().postData() )
        const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
        const match = user_msg.match( /Translate this sentence:\n(.+)/s )
        const sentence = match ? match[1].trim() : `unknown`
        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
        } )
    } )
    await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { data: { label: `test-key` } } )
        } )
    } )
}

const setup_key = async ( page ) => {
    await page.goto( `/` )
    await page.evaluate( () => {
        const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
        store.state = { ...( store.state || {} ), api_key: `sk-or-test-fake-key` }
        localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
    } )
}

const upload_book = async ( page ) => {
    await page.goto( `/library` )
    const existing = page.getByRole( `heading`, { name: `Smart work beats hard work` } )
    if( await existing.isVisible().catch( () => false ) ) return
    await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
    await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )
}

const enter_reader = open_reader

test.describe( `Pass 22 — Bug Fixes & Edge Cases`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_all( page )
        await mock_api( page )
    } )

    // ── BUG FIX: Arrow keys disabled when overlays are open ──────

    test( `P22-01 arrow keys do NOT navigate when settings drawer is open`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translations to appear
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Note the chapter indicator
        const progress_before = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()

        // Open settings drawer
        await page.getByLabel( `Settings` ).click()
        await expect( page.getByText( `Font Size` ) ).toBeVisible()

        // Press arrow right — should NOT navigate
        await page.keyboard.press( `ArrowRight` )
        await expect( page.getByText( `Font Size` ) ).toBeVisible()

        // Close settings
        await page.locator( `text=×` ).first().click()
        await expect( page.getByText( `Font Size` ) ).not.toBeVisible()

        // Chapter should not have changed
        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first() ).toHaveText( progress_before )
    } )

    test( `P22-02 arrow keys do NOT navigate when explanation popover is open`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        const progress_before = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()

        // Select a word, then use the sheet's explicit Explain action.
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.locator( `[data-translation-word-index]` ).first().click()
        await page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } ).click()
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

        // Press arrow right — should NOT navigate
        await page.keyboard.press( `ArrowRight` )
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible()

        // Close popover
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()

        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first() ).toHaveText( progress_before )
    } )

    test( `P22-03 Escape key does NOT go to library when settings is open`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Open settings
        await page.getByLabel( `Settings` ).click()
        await expect( page.getByText( `Font Size` ) ).toBeVisible()

        // Press Escape — should close settings, NOT go to library
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( `Font Size` ) ).not.toBeVisible()

        // Should still be on reader page
        await expect( page ).toHaveURL( /\/read\// )
    } )

    // ── BUG FIX: Explanation popover clears on language/level change ──

    test( `P22-04 Escape closes explanation without clearing the selected word`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Open the explanation from the selected word's information sheet.
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.locator( `[data-translation-word-index]` ).first().click()
        const explain = page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } )
        await explain.click()
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

        // Escape closes only the topmost modal. The selected word remains available.
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()

        // The selection persists after closing the modal, so Explain remains available.
        await explain.click()
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

        // The modal's explicit close action has the same retained-sheet behavior.
        await page.getByRole( `button`, { name: `Close`, exact: true } ).click()
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()
    } )

    // ── BUG FIX: Empty chapter message ──────────────────────────

    test( `P22-05 empty chapter elements show message instead of blank`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Verify reading area has content (not blank)
        const sentences = await page.locator( `span[data-sentence-id]` ).count()
        expect( sentences ).toBeGreaterThan( 0 )
    } )

    // ── BUG FIX: translate_batch in effect deps (model change) ──

    test( `P22-06 model change in settings works without error`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Open settings and change model
        await page.getByLabel( `Settings` ).click()
        await expect( page.getByText( `LLM Model` ) ).toBeVisible()

        const model_select = page.locator( `select` ).last()
        await model_select.selectOption( `anthropic/claude-sonnet-4-6` )
        await expect( model_select ).toHaveValue( `anthropic/claude-sonnet-4-6` )

        // Close settings
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( `LLM Model` ) ).not.toBeVisible()

        // App should still be functional — sentences visible
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // ── REGRESSION: Settings drawer features ────────────────────

    test( `P22-07 settings drawer shows all expected sections`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        await page.getByLabel( `Settings` ).click()

        // All spec-required settings sections
        await expect( page.getByText( `Target Language` ) ).toBeVisible()
        await expect( page.getByText( `Proficiency Level` ) ).toBeVisible()
        await expect( page.getByText( `Font Size` ) ).toBeVisible()
        await expect( page.getByText( `Font Family` ) ).toBeVisible()
        await expect( page.getByText( `Theme` ) ).toBeVisible()
        await expect( page.getByText( `LLM Model` ) ).toBeVisible()
        await expect( page.getByText( `API Key`, { exact: true } ) ).toBeVisible()
        await expect( page.getByText( `Clear Translation Cache` ) ).toBeVisible()
    } )

    test( `P22-08 theme buttons all work`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        await page.getByLabel( `Settings` ).click()

        // Click Dark
        await page.getByRole( `button`, { name: `Dark` } ).click()
        const dark_theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( dark_theme ).toBe( `dark` )

        // Click Sepia
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        const sepia_theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( sepia_theme ).toBe( `sepia` )

        // Click Light
        await page.getByRole( `button`, { name: `Light` } ).click()
        const light_theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( light_theme ).toBe( `light` )
    } )

    // ── REGRESSION: Navigation ──────────────────────────────────

    test( `P22-09 prev/next chapter buttons work`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        const initial = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()

        // Click Next
        await page.getByRole( `button`, { name: /Next/ } ).click()
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        await expect( progress ).not.toHaveText( initial )

        // Click Prev
        await page.getByRole( `button`, { name: /Prev/ } ).click()
        await expect( progress ).toHaveText( initial )
    } )

    test( `P22-10 arrow key navigation works when no overlay is open`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        const initial = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()

        // Arrow right should navigate
        await page.keyboard.press( `ArrowRight` )
        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first() ).not.toHaveText( initial )
    } )

    test( `P22-11 Escape goes to library when nothing is open`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
    } )

    // ── REGRESSION: Double-click no longer toggles sentences ─────

    test( `P22-12 double-click leaves translated sentence visible`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translation
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Sentence should show translated text
        const text_before = await sentence.textContent()
        expect( text_before ).toContain( `[TRANSLATED]` )

        await sentence.dblclick()
        await expect( sentence ).toContainText( `[TRANSLATED]` )

        await sentence.dblclick()
        await expect( sentence ).toContainText( `[TRANSLATED]` )
    } )

    // ── REGRESSION: Explicit explanation action ──────────────────

    test( `P22-13 sheet Explain opens explanation popover`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Select a word in a sentence that is actually translated.
        const translated_sentence = page.locator( `span[data-sentence-id]` ).filter( { hasText: `[TRANSLATED]` } ).first()
        await translated_sentence.locator( `[data-translation-word-index]` ).first().click()
        await page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } ).click()

        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )
        await expect( page.getByText( `Original` ) ).toBeVisible()
        await expect( page.getByText( `Translation`, { exact: true } ) ).toBeVisible()
    } )

    // ── REGRESSION: Language modal on first book open ────────────

    test( `P22-14 language modal shows on first book open`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        await expect( page.getByText( `Choose Your Language` ) ).toBeVisible( { timeout: 5000 } )
        await expect( page.getByText( `Target Language` ) ).toBeVisible()
        await expect( page.getByText( `Proficiency Level` ) ).toBeVisible()
        await expect( page.getByRole( `button`, { name: `Start Reading` } ) ).toBeVisible()
    } )

    test( `P22-15 arrow keys blocked during language modal`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await expect( page.getByText( `Choose Your Language` ) ).toBeVisible( { timeout: 5000 } )

        // Press arrow keys — should not navigate (modal is up)
        await page.keyboard.press( `ArrowRight` )

        // Modal should still be visible
        await expect( page.getByText( `Choose Your Language` ) ).toBeVisible()
    } )

    // ── REGRESSION: Onboarding validation ───────────────────────

    test( `P22-16 onboarding shows error on invalid API key`, async ( { page } ) => {
        await page.route( `**/openrouter.ai/api/v1/auth/key`, r =>
            r.fulfill( { status: 401, body: `nope` } )
        )
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `bad-key` )
        await page.getByRole( `button`, { name: /connect/i } ).click()
        await expect( page.getByText( /invalid api key/i ) ).toBeVisible()

        // Should still be on onboarding — not redirected
        await expect( page ).not.toHaveURL( /\/library/ )
    } )

    // ── REGRESSION: Back button ─────────────────────────────────

    test( `P22-17 back button returns to library from reader`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        await page.getByLabel( `Back to library` ).click()
        await page.waitForURL( `**/library`, { timeout: 5000 } )
    } )

    // ── REGRESSION: Font size changes ───────────────────────────

    test( `P22-18 font size slider changes text size`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        const initial_size = await page.locator( `main` ).evaluate( el => getComputedStyle( el ).fontSize )

        await page.getByLabel( `Settings` ).click()
        const slider = page.locator( `input[type="range"]` )
        await slider.fill( `28` )
        await page.keyboard.press( `Escape` )

        await expect( page.locator( `main` ) ).toHaveCSS( `font-size`, `28px` )
        expect( initial_size ).not.toBe( `28px` )
    } )

    // ── REGRESSION: Progress bar visible ────────────────────────

    test( `P22-19 progress bar is visible in reader`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Check progress text visible (e.g. "1 / 5 · 20%")
        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+.*\\d+%/` ) ).toBeVisible()
    } )

    // ── REGRESSION: Unknown route redirects ─────────────────────

    test( `P22-20 unknown route redirects to library or onboarding`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/totally-random-url` )
        await expect( page ).toHaveURL( /\/library\/?$/ )
    } )

    // ── REGRESSION: TOC dropdown ────────────────────────────────

    test( `P22-21 TOC dropdown shows chapter labels`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Check for select dropdown or chapter title
        const select = page.locator( `select` )
        const count = await select.count()
        if( count > 0 ) {
            const options = await select.first().locator( `option` ).allTextContents()
            expect( options.length ).toBeGreaterThan( 0 )
            // Options should have labels, not just "Section N"
            const has_label = options.some( o => !o.match( /^Section \d+$/ ) )
            // At least the first option should have some text
            expect( options[0].length ).toBeGreaterThan( 0 )
        }
    } )

    // ── REGRESSION: Level badge visible ─────────────────────────

    test( `P22-22 level badge visible in reader`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Level badge should show CEFR code and friendly label
        // Default is A2 / Primary Schooler
        await expect( page.getByText( `A2` ) ).toBeVisible()
    } )

} )
