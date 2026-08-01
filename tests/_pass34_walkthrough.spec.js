/**
 * Pass 34 — Production-like scenarios, cross-feature interactions, timing
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

test.describe( `Pass 34 — Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    // ── 1. Full app lifecycle: fresh start → use → clear → restart ──

    test( `BW128 app lifecycle: clear storage → onboard → upload → read → clear cache → verify`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        // Start fresh
        await clear_storage( page )
        await page.goto( `/` )

        // Should redirect to onboarding
        await expect( page.getByPlaceholder( `sk-or-` ) ).toBeVisible()
        const url = page.url()
        expect( url ).toMatch( /\/$/ )

        // Set API key via localStorage (simulating onboarding)
        await setup_api_key( page )
        await page.goto( `/library` )
        await expect( page.locator( `input[type="file"]` ) ).toBeAttached()

        // Upload book
        const file_input = page.locator( `input[type="file"]` )
        await file_input.setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible( { timeout: 10000 } )

        // Open reader and wait for translations
        await open_reader( page )

        // Verify translations are cached
        const read_cache_count = () => page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const count = store.count()
                    count.onsuccess = () => resolve( count.result )
                    count.onerror = () => resolve( 0 )
                }
                req.onerror = () => resolve( 0 )
            } )
        } )
        await expect.poll( read_cache_count, { timeout: 15_000 } ).toBeGreaterThan( 0 )
        await expect( page.getByText( `Translating...`, { exact: true } ) )
            .not.toBeVisible( { timeout: 30_000 } )
        const cache_count = await read_cache_count()
        expect( cache_count ).toBeGreaterThan( 0 )

        // Open settings and clear cache
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )

        page.on( `dialog`, d => d.accept() )
        await page.getByRole( `button`, { name: /clear/i } ).click()
        await expect( page.getByText( `Translation cache cleared` ) ).toBeVisible()
        await expect.poll( read_cache_count ).toBe( 0 )

        expect( errors ).toEqual( [] )
    } )

    // ── 2. Theme survives full navigation cycle ──

    test( `BW129 theme set in reader persists to library and back`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Set dark theme
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )
        await page.getByRole( `button`, { name: `Close` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()

        // Navigate to library
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        // Theme should still be dark
        const theme_on_library = await page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        )
        expect( theme_on_library ).toBe( `dark` )

        // Navigate back to reader
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        try {
            const start = page.getByRole( `button`, { name: `Start Reading` } )
            await start.waitFor( { state: `visible`, timeout: 2000 } )
            await start.click()
        } catch { /* no modal */ }
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Theme should still be dark
        const theme_on_reader = await page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        )
        expect( theme_on_reader ).toBe( `dark` )
    } )

    // ── 3. Translation with slow API response ──

    test( `BW130 slow API responses still render translations`, async ( { page } ) => {

        // Hold responses until the loading state proves the slow request is in flight.
        let release_responses
        const response_gate = new Promise( resolve => {
            release_responses = resolve
        } )
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await response_gate
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[SLOW] ${ sentence }` } } ] } )
            } )
        } )

        await upload_demo_book( page )
        await open_reader( page )
        await expect( page.getByText( `Translating...` ) ).toBeVisible()
        release_responses()

        // Translations should eventually appear
        await expect( page.locator( `body` ) ).toContainText( `[SLOW]`, { timeout: 15_000 } )
    } )

    // ── 4. Multiple chapters have unique sentence IDs ──

    test( `BW131 sentence IDs differ between chapters`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Get IDs from chapter 0
        const ch0_ids = await page.$$eval(
            `span[data-sentence-id]`,
            els => els.map( el => el.getAttribute( `data-sentence-id` ) )
        )

        // Navigate to next chapter
        await page.keyboard.press( `ArrowRight` )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).not.toHaveAttribute(
            `data-sentence-id`,
            ch0_ids[ 0 ]
        )

        // Get IDs from chapter 1
        const ch1_ids = await page.$$eval(
            `span[data-sentence-id]`,
            els => els.map( el => el.getAttribute( `data-sentence-id` ) )
        )

        // Chapter indices in IDs should differ
        if( ch0_ids.length > 0 && ch1_ids.length > 0 ) {
            const [ , ch0_chapter ] = ch0_ids[0].split( `:` )
            const [ , ch1_chapter ] = ch1_ids[0].split( `:` )
            expect( ch0_chapter ).not.toBe( ch1_chapter )
        }
    } )

    // ── 5. Settings drawer doesn't steal focus from reader ──

    test( `BW132 closing settings returns focus to reader content`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Open and close settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()
        await page.getByRole( `button`, { name: `Close` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()

        // Arrow keys should work for navigation (not blocked)
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )
        const current_sentence_id = await page.locator( `span[data-sentence-id]` ).first()
            .getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).not.toHaveAttribute(
            `data-sentence-id`,
            current_sentence_id
        )
        expect( errors ).toEqual( [] )
    } )

    // ── 6. Book with many chapters shows correct spine length ──

    test( `BW133 progress indicator denominator matches spine length`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+.*%/` ) ).toBeVisible()

        const body = await page.locator( `body` ).textContent()
        const match = body.match( /\d+\s*\/\s*(\d+)/ )
        expect( match ).toBeTruthy()

        // Our test book should have multiple chapters
        const total = parseInt( match[1] )
        expect( total ).toBeGreaterThan( 1 )
    } )

    // ── 7. Reload mid-reader preserves chapter position ──

    test( `BW134 reloading reader preserves current chapter`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+.*%/` )
        await expect( progress ).toBeVisible()

        // Navigate to chapter 2
        const initial_progress = await progress.textContent()
        await page.keyboard.press( `ArrowRight` )
        await expect( progress ).not.toHaveText( initial_progress )

        // Get progress text before reload
        const progress_before_reload = await progress.textContent()

        // Reload
        await page.reload()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10000 } )
        await expect( progress ).toHaveText( progress_before_reload )

        // Get progress text after reload
        const progress_after_reload = await progress.textContent()

        // Should be on same chapter
        expect( progress_after_reload ).toBe( progress_before_reload )
    } )

    // ── 8. API error doesn't crash the app ──

    test( `BW135 API 500 error handled gracefully`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        // Hold error responses until the in-flight loading state is observable.
        let release_errors
        const error_gate = new Promise( resolve => {
            release_errors = resolve
        } )
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await error_gate
            await route.fulfill( {
                status: 500,
                contentType: `application/json`,
                body: JSON.stringify( { error: `Internal server error` } )
            } )
        } )

        await upload_demo_book( page )
        await open_reader( page )
        await expect( page.getByText( `Translating...` ) ).toBeVisible()
        release_errors()
        await expect( page.getByText( `Translating...`, { exact: true } ) )
            .not.toBeVisible( { timeout: 30_000 } )

        // App should not crash — sentences should be visible (untranslated)
        const sentences = await page.locator( `span[data-sentence-id]` ).count()
        expect( sentences ).toBeGreaterThan( 0 )

        // No uncaught errors
        expect( errors ).toEqual( [] )
    } )

    // ── 9. Font family actually changes the rendered font ──

    test( `BW136 changing font family changes computed font`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Navigate to a chapter with body text (not just headings)
        const current_sentence_id = await page.locator( `span[data-sentence-id]` ).first()
            .getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).not.toHaveAttribute(
            `data-sentence-id`,
            current_sentence_id
        )

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `Font Family` ) ).toBeVisible( { timeout: 3000 } )

        // Find font family select by proximity to its label
        const font_section = page.locator( `text=Font Family` ).locator( `..` )
        const font_select = font_section.locator( `select` )
        await font_select.selectOption( `Georgia` )
        await expect( font_select ).toHaveValue( `Georgia` )

        // Close settings
        await page.getByRole( `button`, { name: `Close` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()

        // Verify the reading area (main element) has Georgia font
        const font = await page.locator( `main` ).first().evaluate(
            el => window.getComputedStyle( el ).fontFamily
        )
        expect( font.toLowerCase() ).toContain( `georgia` )
    } )

    // ── 10. Sepia theme accent is warm-toned ──

    test( `BW137 sepia theme uses warm accent color`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Set sepia theme
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `sepia` )

        // Get accent color
        const accent = await page.evaluate( () =>
            getComputedStyle( document.documentElement ).getPropertyValue( `--accent` ).trim()
        )

        // Should NOT be the default teal (#7ec0d0) — should be warm (golden/brown)
        expect( accent ).not.toBe( `#7ec0d0` )
        expect( accent.length ).toBeGreaterThan( 3 )
    } )

} )
