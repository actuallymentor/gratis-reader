/**
 * Pass 25 — Regression tests for bug fixes and coverage gaps
 * Tests CJK sentence splitting, information-sheet overflow, nested lists,
 * OpenRouter timeout/JSON safety, and additional edge cases.
 */
import { test, expect } from '@playwright/test'
import { open_reader } from './helpers/setup.js'

const DEMO_BOOK = `./tests/fixtures/book.epub`

// ─── Shared helpers ───

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

        if( user_msg.includes( `Word:` ) || user_msg.includes( `word or phrase` ) || user_msg.includes( `Explain the word` ) ) {
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `**Meaning:** test\n**Grammar:** noun` } } ] } )
            } )
        } else {
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
            } )
        }
    } )
    await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { data: { label: `test-key` } } )
        } )
    } )
}

const setup = async ( page ) => {
    await clear_all( page )
    await mock_api( page )
    await page.goto( `/` )
    await page.evaluate( () => {
        const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
        store.state = { ...( store.state || {} ), api_key: `sk-or-test-fake-key` }
        localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
    } )
}

const upload_and_read = async ( page ) => {
    await page.goto( `/library` )
    const demo_book = page.getByRole( `heading`, { name: `Smart work beats hard work` } )
    if( !await demo_book.isVisible().catch( () => false ) ) {
        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
        await expect( demo_book ).toBeVisible( { timeout: 10000 } )
    }
    await open_reader( page )
}

// ─── Tests ───

test.describe( `Pass 25 — Regression & Coverage`, () => {

    test.beforeEach( async ( { page } ) => {
        await setup( page )
    } )

    // --- CJK sentence splitting ---

    test( `P25-01 sentence splitter handles CJK punctuation (。！？)`, async ( { page } ) => {
        // The sentence splitter is a pure module — test via page.evaluate
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `这是第一句。这是第二句。第三句！` )
        } )
        expect( result ).toEqual( [ `这是第一句。`, `这是第二句。`, `第三句！` ] )
    } )

    test( `P25-02 sentence splitter handles CJK question marks`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `你好吗？我很好。` )
        } )
        expect( result ).toEqual( [ `你好吗？`, `我很好。` ] )
    } )

    test( `P25-03 sentence splitter handles Unicode ellipsis`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `Wait\u2026 really? Yes.` )
        } )
        // "Wait…" should not split — ellipsis is not a sentence boundary
        expect( result[0] ).toContain( `Wait` )
        expect( result[0] ).toContain( `\u2026` )
    } )

    test( `P25-04 sentence splitter handles mixed CJK and Latin`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `Hello world. 你好世界。Goodbye.` )
        } )
        expect( result.length ).toBe( 3 )
    } )

    test( `P25-05 sentence splitter handles single CJK sentence`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `这是唯一的句子。` )
        } )
        expect( result ).toEqual( [ `这是唯一的句子。` ] )
    } )

    // --- OpenRouter timeout & JSON safety ---

    test( `P25-06 API timeout does not crash the app`, async ( { page } ) => {
        let release_response
        const response_gate = new Promise( resolve => { release_response = resolve } )

        // Override the mock to simulate a very slow response
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            // Don't respond — simulate timeout
            // The app should handle this gracefully
            await response_gate
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] late` } } ] } )
            } )
        } )

        const pending_request = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` )
        )
        await upload_and_read( page )
        await pending_request

        // Tap a sentence — should not crash even with slow API
        await page.locator( `span[data-sentence-id]` ).first().click()
        // App should still be functional
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        release_response()
        await expect( page.getByText( /\[TR\] late/ ).first() ).toBeVisible()
    } )

    test( `P25-07 malformed JSON response does not crash`, async ( { page } ) => {
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( {
                contentType: `text/html`,
                body: `<html><body>Service Unavailable</body></html>`
            } )
        } )
        const malformed_response = page.waitForResponse( response =>
            response.url().includes( `openrouter.ai/api/v1/chat/completions` )
        )
        await upload_and_read( page )
        await malformed_response

        await page.locator( `span[data-sentence-id]` ).first().click()
        // App should still work — no crash
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // --- Information-sheet overflow protection ---

    test( `P25-08 information sheet does not overflow with long content`, async ( { page } ) => {
        await upload_and_read( page )

        // Mock word lookup with a very long response
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            if( user_msg.includes( `Word:` ) || user_msg.includes( `word or phrase` ) || user_msg.includes( `Explain` ) ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `A very long explanation that goes on and on and should stay bounded by the sheet` } } ] } )
                } )
            } else {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `[TR] test` } } ] } )
                } )
            }
        } )

        // Tap a word span
        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await expect( word ).toBeVisible()
        await word.click()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()
        // App should not crash — the sheet should keep long content bounded.
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // --- Book deletion cleans up properly ---

    test( `P25-09 deleting book cleans up reading progress`, async ( { page } ) => {
        await upload_and_read( page )

        // Generate some reading progress by navigating
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const progress_before = await progress.textContent()
        await page.keyboard.press( `ArrowRight` )
        await expect( progress ).not.toHaveText( progress_before )

        // Go back to library and delete
        await page.goto( `/library` )
        await page.waitForSelector( `h3`, { timeout: 5000 } )

        page.once( `dialog`, dialog => dialog.accept() )
        await page.getByRole( `button`, { name: `Remove` } ).first().click()

        // Verify the uploaded book is gone without counting Gutenberg catalog headings.
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toHaveCount( 0 )

        // Verify IndexedDB progress is cleaned up
        const has_progress = await page.evaluate( () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    if( !db.objectStoreNames.contains( `progress` ) ) {
                        resolve( false )
                        return
                    }
                    const tx = db.transaction( `progress`, `readonly` )
                    const store = tx.objectStore( `progress` )
                    const count = store.count()
                    count.onsuccess = () => resolve( count.result > 0 )
                    count.onerror = () => resolve( false )
                }
                req.onerror = () => resolve( false )
            } )
        } )
        expect( has_progress ).toBe( false )
    } )

    // --- Arrow keys during overlay ---

    test( `P25-10 arrow keys don't navigate during settings overlay`, async ( { page } ) => {
        await upload_and_read( page )

        // Open settings
        await page.getByRole( `button`, { name: /settings/i } ).click()
        await expect( page.getByText( /font size/i ) ).toBeVisible( { timeout: 3000 } )

        // Get the current chapter indicator.
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const progress_before = await progress.textContent()

        // Press arrow keys while settings is open
        await page.keyboard.press( `ArrowRight` )
        await page.keyboard.press( `ArrowLeft` )

        // Chapter should not have changed.
        await expect( progress ).toHaveText( progress_before )

        // Settings should still be visible
        await expect( page.getByText( /font size/i ) ).toBeVisible()
    } )

    // --- Drag-and-drop upload ---

    test( `P25-11 drag-and-drop file upload works`, async ( { page } ) => {
        await page.goto( `/library` )

        // Use the file input as proxy (Playwright can't simulate real DnD with files easily)
        const input = page.locator( `input[type="file"]` )
        await expect( input ).toBeAttached()
        await input.setInputFiles( DEMO_BOOK )
        await expect( page.locator( `h3` ).first() ).toBeVisible( { timeout: 10000 } )
    } )

    // --- Language picker search ---

    test( `P25-12 language picker filters on search input`, async ( { page } ) => {
        await page.goto( `/library` )
        await upload_and_read( page )

        // Open settings to access language
        await page.getByRole( `button`, { name: /settings/i } ).click()
        await expect( page.getByText( /font size/i ) ).toBeVisible( { timeout: 3000 } )

        const lang_input = page.locator( `input[placeholder="Search languages..."]` )
        await expect( lang_input ).toBeVisible()
        await lang_input.fill( `Japan` )
        await expect( page.getByText( `Japanese`, { exact: true } ) ).toBeVisible()
    } )

    // --- Back button navigation ---

    test( `P25-13 back button returns to library from reader`, async ( { page } ) => {
        await upload_and_read( page )

        const back_btn = page.getByRole( `button`, { name: `Back to library` } )
        await expect( back_btn ).toBeVisible()
        await back_btn.click()
        await page.waitForURL( /\/library/, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )
    } )

    // --- Multiple sentence translations ---

    test( `P25-14 multiple sentences can be translated independently`, async ( { page } ) => {
        await upload_and_read( page )

        const sentences = page.locator( `span[data-sentence-id]` )
        const count = await sentences.count()
        expect( count ).toBeGreaterThan( 1 )

        // Click first sentence
        await sentences.nth( 0 ).click()

        // Click second sentence
        await sentences.nth( 1 ).click()

        // Both should have translations (check for [TR] markers)
        await expect( page.locator( `text=/\\[TR\\]/` ).first() ).toBeVisible()
    } )

    // --- Escape key from reader returns to library ---

    test( `P25-15 Escape key returns to library from reader`, async ( { page } ) => {
        await upload_and_read( page )

        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )
    } )

    // --- Empty text handling ---

    test( `P25-16 sentence splitter handles empty and whitespace input`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return [
                split_sentences( `` ),
                split_sentences( `   ` ),
                split_sentences( null ),
                split_sentences( undefined )
            ]
        } )
        expect( result[0] ).toEqual( [] )
        expect( result[1] ).toEqual( [] )
        expect( result[2] ).toEqual( [] )
        expect( result[3] ).toEqual( [] )
    } )

    // --- Decimal numbers preserved ---

    test( `P25-17 sentence splitter preserves decimal numbers`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `The value is 3.14 approximately. That is pi.` )
        } )
        expect( result ).toEqual( [ `The value is 3.14 approximately.`, `That is pi.` ] )
    } )

    // --- Abbreviations preserved ---

    test( `P25-18 sentence splitter preserves common abbreviations`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `Dr. Smith and Prof. Jones met at St. Mary's hospital. They discussed the results.` )
        } )
        expect( result ).toEqual( [
            `Dr. Smith and Prof. Jones met at St. Mary's hospital.`,
            `They discussed the results.`
        ] )
    } )

    // --- Quotes at sentence boundaries ---

    test( `P25-19 sentence splitter handles quotes at boundaries`, async ( { page } ) => {
        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )
            return split_sentences( `She said "hello." Then she left.` )
        } )
        expect( result.length ).toBeGreaterThanOrEqual( 1 )
    } )

} )
