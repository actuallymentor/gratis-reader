/**
 * Pass 23 — edge case browser walkthrough.
 * Focuses on error states, rapid interactions, and unusual sequences.
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

const get_first_book_added_at = page => page.evaluate( async () => {
    return new Promise( resolve => {
        const request = indexedDB.open( `gratis_reader` )
        request.onsuccess = () => {
            const transaction = request.result.transaction( `books`, `readonly` )
            const book_request = transaction.objectStore( `books` ).getAll()
            book_request.onsuccess = () => resolve( book_request.result[ 0 ].added_at )
        }
    } )
} )

const enter_reader = open_reader

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

        let request_count = 0

        // Render some content, then exercise the failed-translation path.
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            request_count++

            if( request_count > 2 ) {
                await route.fulfill( { status: 500, body: `Internal Server Error` } )
                return
            }

            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( message => message.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[ 1 ]?.trim() || `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
            } )
        } )

        const failed_response = page.waitForResponse( response =>
            response.url().includes( `openrouter.ai/api/v1/chat/completions` ) && response.status() === 500
        )
        await enter_reader( page )
        await failed_response

        // Reader should still show original sentences, not crash
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
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
        await expect( page.getByText( /only epub files are supported/i ) ).toBeVisible()
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toHaveCount( 0 )
    } )

    // ── RAPID INTERACTIONS ──────────────────────────────────────

    test( `P23-05 rapid chapter navigation does not break state`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Click Next rapidly 5 times
        const next_btn = page.getByRole( `button`, { name: /Next/ } )
        const progress = page.locator( `text=/\d+\s*\/\s*\d+/` ).first()
        const progress_before = await progress.textContent()
        for( let i = 0; i < 5; i++ ) {
            await next_btn.click()
        }

        // App should still be functional — not crashed, sentences visible
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
        await expect( progress ).not.toHaveText( progress_before )

        // Progress should show we advanced at least some chapters
        const footer_text = await page.locator( `footer` ).textContent()
        const match = footer_text.match( /(\d+)\s*\/\s*(\d+)/ )
        // Chapter number should be at least 1 (0-indexed display is 1-based)
        expect( match ).toBeTruthy()
        expect( parseInt( match[1] ) ).toBeGreaterThanOrEqual( 1 )
    } )

    test( `P23-06 rapid sentence clicking does not crash`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Click first sentence rapidly 10 times
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        for( let i = 0; i < 10; i++ ) {
            await sentence.click()
        }

        // App should still be functional
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // ── MULTI-BOOK SCENARIOS ────────────────────────────────────

    test( `P23-07 uploading same book twice does not duplicate`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // Upload the same book twice
        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )
        const first_added_at = await get_first_book_added_at( page )

        await page.locator( `input[type="file"]` ).setInputFiles( [] )
        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
        await expect.poll( () => get_first_book_added_at( page ) ).not.toBe( first_added_at )

        // Should still have exactly 1 book
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toHaveCount( 1 )
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
        await expect( page.getByText( `Font Size` ) ).not.toBeVisible()

        // Reload the entire page
        await page.reload( { waitUntil: `networkidle` } )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        // Check theme persisted
        await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )

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

        expect( option_count ).toBeGreaterThan( 1 )
        await toc_select.selectOption( { index: option_count - 1 } )

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
        await expect( select ).toBeVisible()
        expect( await select.locator( `option` ).count() ).toBeGreaterThan( 3 )
        await select.selectOption( { index: 3 } )

        // Progress should show chapter 4
        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first() ).toContainText( `4` )
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

    test( `P23-13 selecting a translated word shows its contextual tooltip`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await word.click()

        await expect( page.locator( `[data-reader-word-tooltip]` ) ).toBeVisible()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()
    } )

    // ── WORD CLICK ──────────────────────────────────────────────

    test( `P23-14 clicking translated word shows information sheet`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Find a word span inside a translated sentence
        const words = page.locator( `span[data-sentence-id] [data-translation-word-index]` )
        await expect( words.first() ).toBeVisible()

        // Tap a word
        await words.first().click()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()
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

        await expect( page.getByText( /offline/i ) ).toBeVisible()

        // Go back online
        await page.evaluate( () => {
            window.dispatchEvent( new Event( `online` ) )
        } )

        await expect( page.getByText( /offline/i ) ).not.toBeVisible()
    } )

    // ── READING PROGRESS ────────────────────────────────────────

    test( `P23-17 reading progress saved and restored`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Navigate to chapter 3
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const first_progress = await progress.textContent()
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect( progress ).not.toHaveText( first_progress )
        const second_progress = await progress.textContent()
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect( progress ).not.toHaveText( second_progress )

        const progress_before = await progress.textContent()

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

        let release_translations
        const translation_gate = new Promise( resolve => { release_translations = resolve } )

        // Hold API responses until the loading indicator has been observed.
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await translation_gate
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
        await expect( page.getByText( `Translating...` ) ).toBeVisible( { timeout: 5000 } )

        // Eventually translations should complete
        release_translations()
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 20_000 } )
    } )

    // ── ONBOARDING EDGE CASES ───────────────────────────────────

    test( `P23-20 cannot bypass onboarding without API key`, async ( { page } ) => {
        await page.goto( `/library` )
        // Should redirect to onboarding
        await expect( page ).toHaveURL( `/` )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
    } )

} )
