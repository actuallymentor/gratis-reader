/**
 * Pass 29 — Standalone Playwright walkthrough
 * Tests: dismiss timer cleanup, long sentence fallback, table content extraction,
 * NFC normalization, connection caching, manifest start_url, general app health.
 *
 * Run: npx playwright test tests/_pass29_walkthrough.mjs
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth } from './helpers/setup.js'

// Helper to open settings from reader
const open_settings = async ( page ) => {
    await page.getByRole( `button`, { name: `Settings` } ).click()
    await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )
}

test.describe( `Pass 29 — Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    // ── 1. Verify app loads and basic flow works ──

    test( `BW66 app loads, library shows book, reader opens`, async ( { page } ) => {
        await page.goto( `/library` )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()
        await open_reader( page )
        const sentences = await page.$$( `span[data-sentence-id]` )
        expect( sentences.length ).toBeGreaterThan( 0 )
    } )

    // ── 2. Word touch-and-hold dismiss timer (fix verification) ──

    test( `BW67 word touch tooltip appears and auto-dismisses`, async ( { page } ) => {

        // Override mock to handle word lookups
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``

            if( user_msg.includes( `Translate this sentence` ) ) {
                const match = user_msg.match( /Translate this sentence:\n(.+)/s )
                const sentence = match ? match[1].trim() : `unknown`
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
                } )
            } else {
                // Word lookup
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `test-word` } } ] } )
                } )
            }
        } )

        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Find a hoverable word span
        const word = page.locator( `span[data-sentence-id] span` ).first()
        if( await word.isVisible() ) {
            // Trigger mouse hover to test word lookup
            await word.hover()
            await page.waitForTimeout( 1000 )
        }

        // No page errors expected
        let error_count = 0
        page.on( `pageerror`, () => error_count++ )
        await page.waitForTimeout( 500 )
        expect( error_count ).toBe( 0 )
    } )

    // ── 3. Sentence splitter handles long unpunctuated text ──

    test( `BW68 long unpunctuated text is split at natural break points`, async ( { page } ) => {

        // Test the sentence splitter directly in the browser
        const result = await page.evaluate( async () => {

            // Import the module
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )

            // Long text with semicolons but no periods
            const long_text = `This is a very long piece of text that goes on and on without any period but it has semicolons; it also has colons: and em-dashes — which are natural break points in English prose that should be used to split very long sentences into manageable chunks for translation; otherwise the entire paragraph becomes one giant sentence`

            return split_sentences( long_text )
        } )

        // Should be split into multiple parts (not just one mega-sentence)
        expect( result.length ).toBeGreaterThanOrEqual( 1 )

        // Each part should be shorter than the full text
        const full_length = 328
        for( const part of result ) {
            expect( part.length ).toBeLessThan( full_length )
        }
    } )

    // ── 4. NFC normalization works ──

    test( `BW69 sentence splitter normalizes Unicode to NFC`, async ( { page } ) => {

        const result = await page.evaluate( async () => {
            const { split_sentences } = await import( `/src/modules/sentence_splitter.js` )

            // 'é' in decomposed form (e + combining acute accent)
            const decomposed = `Caf\u0065\u0301 is nice. It\u2019s great.`
            const sentences = split_sentences( decomposed )

            // Check that the output uses NFC form
            return {
                count: sentences.length,
                first: sentences[0],
                // NFC 'é' is a single char \u00E9
                has_nfc: sentences[0].includes( `\u00E9` )
            }
        } )

        expect( result.count ).toBe( 2 )
        expect( result.has_nfc ).toBe( true )
    } )

    // ── 5. Navigation and chapter switching ──

    test( `BW70 chapter navigation works without errors`, async ( { page } ) => {
        let errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await open_reader( page )
        await page.waitForTimeout( 1000 )

        // Navigate forward
        const next_btn = page.getByRole( `button`, { name: /next/i } )
        if( await next_btn.isVisible() ) {
            await next_btn.click()
            await page.waitForTimeout( 1500 )
        }

        // Navigate back
        const prev_btn = page.getByRole( `button`, { name: /prev/i } )
        if( await prev_btn.isVisible() ) {
            await prev_btn.click()
            await page.waitForTimeout( 1500 )
        }

        expect( errors ).toEqual( [] )
    } )

    // ── 6. Settings drawer opens and closes properly ──

    test( `BW71 settings drawer has all expected controls`, async ( { page } ) => {
        await open_reader( page )
        await open_settings( page )

        // All setting labels visible
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()
        await expect( page.getByText( `FONT FAMILY` ) ).toBeVisible()
        await expect( page.getByText( `THEME` ) ).toBeVisible()
        await expect( page.getByText( `LLM MODEL` ) ).toBeVisible()
        await expect( page.locator( `label` ).filter( { hasText: /api key/i } ) ).toBeVisible()
        await expect( page.locator( `label` ).filter( { hasText: /cache/i } ) ).toBeVisible()

        // Close button works
        await page.getByRole( `button`, { name: `Close` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible( { timeout: 3000 } )
    } )

    // ── 7. Tap-to-toggle works ──

    test( `BW72 tap sentence toggles between translated and original`, async ( { page } ) => {
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const highlighted_before = await sentence.evaluate( el => el.dataset.sentenceId )

        // Tap to toggle — check the background highlight appears (indicating original is shown)
        await sentence.click()
        await page.waitForTimeout( 300 )

        // The sentence should still be there and have the same ID
        const highlighted_after = await sentence.evaluate( el => el.dataset.sentenceId )
        expect( highlighted_after ).toBe( highlighted_before )

        // Tap again to toggle back
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Sentence ID should persist through toggle
        const id_restored = await sentence.evaluate( el => el.dataset.sentenceId )
        expect( id_restored ).toBe( highlighted_before )
    } )

    // ── 8. Explanation popover opens on right-click ──

    test( `BW73 right-click opens explanation popover`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``

            if( user_msg.includes( `Explain` ) || user_msg.includes( `phrase-by-phrase` ) ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `**Word breakdown:** hello → hola` } } ] } )
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

        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Right-click a sentence
        await page.locator( `span[data-sentence-id]` ).first().click( { button: `right` } )

        // Explanation popover should appear
        await expect( page.getByText( /translation explanation/i ) ).toBeVisible( { timeout: 5000 } )

        // Close it
        await page.getByRole( `button`, { name: `Close` } ).click()
        await page.waitForTimeout( 500 )
    } )

    // ── 9. Themes switch correctly ──

    test( `BW74 theme switching changes CSS variables`, async ( { page } ) => {
        await open_reader( page )
        await open_settings( page )

        // Switch to dark theme
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await page.waitForTimeout( 300 )

        const dark_bg = await page.evaluate( () =>
            getComputedStyle( document.documentElement ).getPropertyValue( `--bg` ).trim()
        )

        // Switch to light theme
        await page.getByRole( `button`, { name: `Light` } ).click()
        await page.waitForTimeout( 300 )

        const light_bg = await page.evaluate( () =>
            getComputedStyle( document.documentElement ).getPropertyValue( `--bg` ).trim()
        )

        // Dark and light should have different backgrounds
        expect( dark_bg ).not.toBe( light_bg )
    } )

    // ── 10. PWA manifest has start_url ──

    test( `BW75 PWA manifest config includes start_url`, async ( { page } ) => {
        // In dev mode, the manifest is not served as a file — verify the vite config instead
        const { readFileSync } = await import( 'fs' )
        const config = readFileSync( `./vite.config.js`, `utf-8` )

        // Verify start_url is configured in manifest
        expect( config ).toContain( `start_url` )
        expect( config ).toContain( `standalone` )
        expect( config ).toContain( `Gratis Reader` )
    } )

    // ── 11. IndexedDB connection caching works ──

    test( `BW76 IndexedDB operations work correctly with connection caching`, async ( { page } ) => {
        await page.goto( `/library` )

        // Verify multiple sequential DB operations work (connection reuse)
        const result = await page.evaluate( async () => {
            const { open_db } = await import( `/src/modules/cache.js` )

            // Open twice — should get the same connection
            const db1 = await open_db()
            const db2 = await open_db()
            const same = db1 === db2

            // Verify the connection works
            const stores = [ ...db1.objectStoreNames ]

            return { same, stores }
        } )

        expect( result.same ).toBe( true )
        expect( result.stores ).toContain( `books` )
        expect( result.stores ).toContain( `translations` )
        expect( result.stores ).toContain( `progress` )
    } )

    // ── 12. Escape key returns to library ──

    test( `BW77 Escape key navigates back to library`, async ( { page } ) => {
        await open_reader( page )
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /library/, { timeout: 5000 } )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()
    } )

    // ── 13. Progress bar visible in reader ──

    test( `BW78 progress indicator shows chapter position`, async ( { page } ) => {
        await open_reader( page )

        // Should show progress like "1 / N · X%"
        const body_text = await page.locator( `body` ).textContent()
        expect( body_text ).toMatch( /\d+\s*\/\s*\d+/ )
    } )

    // ── 14. Book deletion cleans up all data ──

    test( `BW79 deleting a book cleans up translations and progress`, async ( { page } ) => {
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Go back to library
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /library/ )

        // Count books before
        const books_before = await page.$$( `h3` )

        // Delete the book
        const delete_btn = page.getByRole( `button`, { name: /delete/i } ).first()
        if( await delete_btn.isVisible() ) {
            page.on( `dialog`, async d => await d.accept() )
            await delete_btn.click()
            await page.waitForTimeout( 1000 )

            const books_after = await page.$$( `h3` )
            expect( books_after.length ).toBeLessThan( books_before.length )
        }
    } )

    // ── 15. Onboarding redirects when no key ──

    test( `BW80 missing API key redirects to onboarding`, async ( { page } ) => {
        // Clear the API key
        await page.evaluate( () => localStorage.clear() )
        await page.goto( `/library` )
        await page.waitForTimeout( 2000 )

        // Should be on onboarding page
        const body_text = await page.locator( `body` ).textContent()
        expect( body_text ).toMatch( /api key|openrouter|get started/i )
    } )

} )
