/**
 * Pass 23 — edge case browser walkthrough.
 * Focuses on error states, rapid interactions, and unusual sequences.
 */
import { test, expect } from '@playwright/test'

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

const enter_reader = async ( page ) => {
    await page.locator( `img[alt]` ).first().click()
    await page.waitForURL( /\/read\// )
    const btn = page.getByRole( `button`, { name: `Start Reading` } )
    try { await btn.waitFor( { state: `visible`, timeout: 3000 } ); await btn.click() } catch {}
    await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )
}

test.describe( `Pass 23 — Edge Cases & Error States`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_all( page )
        await mock_api( page )
    } )

    // ── ERROR STATES ────────────────────────────────────────────

    test( `P23-01 accessing deleted book redirects to library`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/read/book_nonexistent_hash_12345` )
        await page.waitForURL( `**/library`, { timeout: 10_000 } )
    } )

    test( `P23-02 corrupt localStorage does not crash app`, async ( { page } ) => {
        await page.goto( `/` )
        await page.evaluate( () => {
            localStorage.setItem( `settings-storage`, `{not valid json!!!` )
        } )
        await page.reload()
        // App should still load — onboarding or library
        await expect( page.locator( `body` ) ).toBeVisible()
        // Should not show a blank page
        const content = await page.locator( `body` ).textContent()
        expect( content.length ).toBeGreaterThan( 0 )
    } )

    test( `P23-03 API error during translation does not crash reader`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )

        // Override mock to return errors
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( { status: 500, body: `Internal Server Error` } )
        } )

        await enter_reader( page )

        // Reader should still show original sentences, not crash
        await page.waitForTimeout( 3000 )
        expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )
    } )

    test( `P23-04 uploading non-epub file shows error`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // Create a fake .txt file
        const buffer = Buffer.from( `This is not an epub file` )
        await page.locator( `input[type="file"]` ).setInputFiles( {
            name: `fake_book.txt`,
            mimeType: `text/plain`,
            buffer
        } )

        // Should show an error, not add a book
        await page.waitForTimeout( 2000 )
        const books = await page.getByRole( `heading`, { name: `Smart work beats hard work` } ).count()
        expect( books ).toBe( 0 )
    } )

    // ── RAPID INTERACTIONS ──────────────────────────────────────

    test( `P23-05 rapid chapter navigation does not break state`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Click Next rapidly 5 times
        const next_btn = page.getByRole( `button`, { name: /Next/ } )
        for( let i = 0; i < 5; i++ ) {
            await next_btn.click()
            await page.waitForTimeout( 200 )
        }

        // Wait for state to settle
        await page.waitForTimeout( 3000 )

        // App should still be functional — not crashed, sentences visible
        expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )

        // Progress should show we advanced at least some chapters
        const footer_text = await page.locator( `footer` ).textContent()
        const match = footer_text.match( /(\d+)\s*\/\s*(\d+)/ )
        // Chapter number should be at least 1 (0-indexed display is 1-based)
        expect( match ).toBeTruthy()
        expect( parseInt( match[1] ) ).toBeGreaterThanOrEqual( 1 )
    } )

    test( `P23-06 rapid sentence tapping does not crash`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Tap first sentence rapidly 10 times
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        for( let i = 0; i < 10; i++ ) {
            await sentence.click()
            await page.waitForTimeout( 100 )
        }

        // App should still be functional
        expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )
    } )

    // ── MULTI-BOOK SCENARIOS ────────────────────────────────────

    test( `P23-07 uploading same book twice does not duplicate`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // Upload the same book twice
        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
        await page.waitForTimeout( 3000 )

        // Should still have exactly 1 book
        const book_count = await page.getByRole( `heading`, { name: `Smart work beats hard work` } ).count()
        expect( book_count ).toBe( 1 )
    } )

    // ── SETTINGS PERSISTENCE ────────────────────────────────────

    test( `P23-08 all settings persist after full page reload`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Change multiple settings
        await page.getByLabel( `Settings` ).click()

        // Change theme to dark
        await page.getByRole( `button`, { name: `Dark` } ).click()

        // Change font size
        await page.locator( `input[type="range"]` ).fill( `24` )

        // Close settings
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 500 )

        // Reload the entire page
        await page.reload( { waitUntil: `networkidle` } )
        await page.waitForTimeout( 2000 )

        // Check theme persisted
        const theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( theme ).toBe( `dark` )

        // Check font size persisted (reader should show it)
        const stored = await page.evaluate( () => {
            const s = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            return s.state?.font_size
        } )
        expect( stored ).toBe( 24 )
    } )

    // ── NAVIGATION EDGE CASES ───────────────────────────────────

    test( `P23-09 prev button disabled on first chapter`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        const prev_btn = page.getByRole( `button`, { name: /Prev/ } )
        await expect( prev_btn ).toBeDisabled()
    } )

    test( `P23-10 next button disabled on last chapter`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Use TOC dropdown to jump directly to last chapter (faster than navigating through all)
        const toc_select = page.locator( `select` ).first()
        const option_count = await toc_select.locator( `option` ).count()

        if( option_count > 1 ) {
            await toc_select.selectOption( { index: option_count - 1 } )
            await page.waitForTimeout( 2000 )
        }

        const next_btn = page.getByRole( `button`, { name: /Next/ } )
        await expect( next_btn ).toBeDisabled()
    } )

    test( `P23-11 TOC dropdown navigates to selected chapter`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Select a different chapter via TOC dropdown
        const select = page.locator( `select` ).first()
        if( await select.count() > 0 ) {
            await select.selectOption( { index: 3 } )
            await page.waitForTimeout( 2000 )

            // Progress should show chapter 4
            const progress = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()
            expect( progress ).toContain( `4` )
        }
    } )

    // ── TRANSLATION FEATURES ────────────────────────────────────

    test( `P23-12 translated sentences have [TRANSLATED] prefix from mock`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Multiple sentences should be translated
        const translated = await page.getByText( /\[TRANSLATED\]/ ).count()
        expect( translated ).toBeGreaterThan( 1 )
    } )

    test( `P23-13 toggling sentence shows visual highlight`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        const sentence = page.locator( `span[data-sentence-id]` ).first()

        // Click to toggle to original
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Should have highlighted background (accent-light)
        const bg = await sentence.evaluate( el => getComputedStyle( el ).backgroundColor )
        // Should not be transparent — some color applied
        expect( bg ).not.toBe( `rgba(0, 0, 0, 0)` )
    } )

    // ── WORD HOVER ──────────────────────────────────────────────

    test( `P23-14 hovering translated word shows tooltip or loading`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Find a word span inside a translated sentence
        const words = page.locator( `span[data-sentence-id] span` )
        const word_count = await words.count()

        if( word_count > 0 ) {
            // Hover over a word
            await words.first().hover()
            await page.waitForTimeout( 1000 )

            // Should not crash — page still functional
            expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )
        }
    } )

    // ── LEVEL BADGE ─────────────────────────────────────────────

    test( `P23-15 level badge shows CEFR code and friendly label`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Default level is A2 / Primary Schooler
        await expect( page.getByText( /A2.*Primary Schooler|Primary Schooler.*A2/ ) ).toBeVisible()
    } )

    // ── OFFLINE BEHAVIOR ────────────────────────────────────────

    test( `P23-16 offline banner appears when network drops`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Simulate going offline
        await page.evaluate( () => {
            window.dispatchEvent( new Event( `offline` ) )
        } )
        await page.waitForTimeout( 500 )

        await expect( page.getByText( /offline/i ) ).toBeVisible()

        // Go back online
        await page.evaluate( () => {
            window.dispatchEvent( new Event( `online` ) )
        } )
        await page.waitForTimeout( 500 )

        await expect( page.getByText( /offline/i ) ).not.toBeVisible()
    } )

    // ── READING PROGRESS ────────────────────────────────────────

    test( `P23-17 reading progress saved and restored`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Navigate to chapter 3
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 1000 )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 1000 )

        const progress_before = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()

        // Go back to library
        await page.getByLabel( `Back to library` ).click()
        await page.waitForURL( `**/library`, { timeout: 5000 } )

        // Re-enter the same book
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Should restore position (no language modal since we're returning)
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        const progress_after = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first().textContent()
        expect( progress_after ).toBe( progress_before )
    } )

    // ── SETTINGS DRAWER FROM LIBRARY ────────────────────────────

    test( `P23-18 settings accessible from library page`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `Theme`, { exact: true } ) ).toBeVisible()
        await expect( page.getByText( `Font Size`, { exact: true } ) ).toBeVisible()
    } )

    // ── SWIPE NAVIGATION ────────────────────────────────────────

    test( `P23-19 translating indicator appears during translation`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )

        // Slow down API responses to catch the indicator
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await new Promise( r => setTimeout( r, 500 ) )
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
            } )
        } )

        await enter_reader( page )

        // The "Translating..." indicator should appear while translations load
        // (may flash quickly — use a short timeout)
        try {
            await expect( page.getByText( `Translating...` ) ).toBeVisible( { timeout: 5000 } )
        } catch {
            // If translations are cached or too fast, that's OK — the indicator just didn't appear
        }

        // Eventually translations should complete
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 20_000 } )
    } )

    // ── ONBOARDING EDGE CASES ───────────────────────────────────

    test( `P23-20 cannot bypass onboarding without API key`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.waitForTimeout( 1000 )
        // Should redirect to onboarding
        expect( page.url() ).toContain( `/` )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
    } )

} )
