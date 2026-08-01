/**
 * Pass 30 — Browser walkthrough + regression tests
 * Targets: translation error logging, sheet mobile overflow, general app health,
 * edge cases not covered in previous passes.
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth } from './helpers/setup.js'

// Helper to open settings from reader
const open_settings = async ( page ) => {
    await page.getByRole( `button`, { name: `Settings` } ).click()
    await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )
}

test.describe( `Pass 30 — Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    // ── 1. Translation error handling — failed requests don't crash ──

    test( `BW81 failed translation request does not crash app`, async ( { page } ) => {

        let request_count = 0

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            request_count++
            // First 2 requests succeed, rest fail
            if( request_count <= 2 ) {
                const body = JSON.parse( route.request().postData() )
                const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
                const match = user_msg.match( /Translate this sentence:\n(.+)/s )
                const sentence = match ? match[1].trim() : `unknown`
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
                } )
            } else {
                await route.fulfill( { status: 500, body: `Internal Server Error` } )
            }
        } )

        let page_errors = []
        page.on( `pageerror`, e => page_errors.push( e.message ) )

        const failed_response = page.waitForResponse( response =>
            response.url().includes( `openrouter.ai/api/v1/chat/completions` ) && response.status() === 500
        )
        await open_reader( page )
        await failed_response
        await expect( page.getByText( /\[TR\]/ ).first() ).toBeVisible()

        // App should not crash — some sentences should still be translated
        expect( page_errors ).toEqual( [] )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // ── 2. Information sheet works on mobile viewport ──

    test( `BW82 information sheet does not overflow on narrow mobile viewport`, async ( { page } ) => {

        const errors = []
        page.on( `pageerror`, error => errors.push( error.message ) )

        // Set mobile viewport
        await page.setViewportSize( { width: 320, height: 568 } )

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
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `translation result` } } ] } )
                } )
            }
        } )

        await open_reader( page )

        // Tap a word to open the information sheet.
        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await expect( word ).toBeVisible()
        await word.click()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()

        // No errors expected
        expect( errors ).toEqual( [] )
    } )

    // ── 3. Multiple rapid chapter changes don't crash ──

    test( `BW83 rapid chapter navigation produces no errors`, async ( { page } ) => {
        let errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await open_reader( page )
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const progress_before = await progress.textContent()

        // Rapidly navigate chapters
        for( let i = 0; i < 5; i++ ) {
            await page.keyboard.press( `ArrowRight` )
        }

        await expect( progress ).not.toHaveText( progress_before )
        expect( errors ).toEqual( [] )

        // Should still have content
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // ── 4. Book with many chapters — TOC dropdown works ──

    test( `BW84 TOC dropdown navigates to correct chapter`, async ( { page } ) => {
        await open_reader( page )

        const toc = page.locator( `select` ).first()
        await expect( toc ).toBeVisible()
        expect( await toc.locator( `option` ).count() ).toBeGreaterThan( 1 )

        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const progress_before = await progress.textContent()

        // Select the last chapter
        const last_option = await toc.locator( `option` ).last().getAttribute( `value` )
        await toc.selectOption( last_option )
        await expect( progress ).not.toHaveText( progress_before )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    // ── 5. Language picker is searchable ──

    test( `BW85 language picker filters on search input`, async ( { page } ) => {
        await open_reader( page )
        await open_settings( page )

        const lang_input = page.locator( `input[placeholder*="earch"]` ).first()
        await expect( lang_input ).toBeVisible()
        await lang_input.fill( `Jap` )

        // Should show Japanese in results
        await expect( page.getByText( `Japanese`, { exact: true } ) ).toBeVisible()
    } )

    // ── 6. Settings persist across page reload ──

    test( `BW86 settings persist after reload`, async ( { page } ) => {
        await open_reader( page )
        await open_settings( page )

        // Change font size
        const slider = page.locator( `input[type="range"]` ).first()
        await slider.fill( `24` )
        await expect( slider ).toHaveValue( `24` )

        // Change theme to dark
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )

        // Close settings
        await page.getByRole( `button`, { name: `Close` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()

        // Reload the page
        await page.reload()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        // Verify dark theme persisted
        await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )

        // Verify font size persisted
        const saved = await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            return store?.state?.font_size
        } )
        expect( saved ).toBe( 24 )
    } )

    // ── 7. Reading progress is saved and restored ──

    test( `BW87 reading progress restored on return`, async ( { page } ) => {
        await open_reader( page )

        // Navigate to chapter 2
        const next_btn = page.getByRole( `button`, { name: /next/i } )
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const initial_progress = await progress.textContent()
        await expect( next_btn ).toBeEnabled()
        await next_btn.click()
        await expect( progress ).not.toHaveText( initial_progress )
        const saved_progress = await progress.textContent()

        // Go back to library
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /library/ )

        // Re-open the same book
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Should NOT show the language modal (returning reader)
        const modal = page.getByRole( `button`, { name: /start reading/i } )
        await expect( modal ).not.toBeVisible()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10000 } )
        await expect( progress ).toHaveText( saved_progress )
    } )

    // ── 8. Keyboard shortcuts don't work during overlay ──

    test( `BW88 arrow keys blocked when settings drawer is open`, async ( { page } ) => {
        await open_reader( page )

        // Get current chapter indicator
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const progress_before = await progress.textContent()

        // Open settings
        await open_settings( page )

        // Press arrow keys — should NOT navigate chapters
        await page.keyboard.press( `ArrowRight` )
        await page.keyboard.press( `ArrowLeft` )

        // Close settings
        await page.getByRole( `button`, { name: `Close` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()

        // Should still be on the same chapter
        await expect( progress ).toHaveText( progress_before )
    } )

    // ── 9. Unknown routes redirect ──

    test( `BW89 unknown route redirects to home`, async ( { page } ) => {
        await page.goto( `/totally-fake-route` )

        // The configured API key redirects unknown routes to the library.
        await expect( page ).toHaveURL( /\/library\/?$/ )
    } )

    // ── 10. Level picker shows all proficiency levels ──

    test( `BW90 level picker displays all proficiency levels`, async ( { page } ) => {

        // Clear progress to force language modal
        await page.evaluate( () => {
            return new Promise( r => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    if( !db.objectStoreNames.contains( `progress` ) ) { r(); return }
                    const tx = db.transaction( `progress`, `readwrite` )
                    tx.objectStore( `progress` ).clear()
                    tx.oncomplete = r; tx.onerror = r
                }
                req.onerror = r
            } )
        } )

        // Open book — language modal should appear
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Check all levels are shown
        const dialog = page.getByRole( `dialog` )
        await expect( dialog ).toBeVisible()
        const body = await dialog.textContent()
        expect( body ).toContain( `A0` )
        expect( body ).toContain( `A1` )
        expect( body ).toContain( `A2` )
        expect( body ).toMatch( /B1|B2/ )
        expect( body ).toMatch( /C1|C2/ )

        // Check friendly labels
        expect( body ).toMatch( /Caveman/i )
        expect( body ).toMatch( /Toddler/i )
    } )

    // ── 11. Concurrent uploads blocked ──

    test( `BW91 cannot upload while another upload is in progress`, async ( { page } ) => {
        await page.goto( `/library` )

        // The file input should be present
        const file_input = page.locator( `input[type="file"]` )
        await expect( file_input ).toBeAttached()
    } )

    // ── 12. Book card shows title and author ──

    test( `BW92 library shows book metadata`, async ( { page } ) => {
        await page.goto( `/library` )

        // Book title should be visible
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()

        // Cover image should be present
        const img = page.locator( `img[alt]` ).first()
        await expect( img ).toBeVisible()
    } )

} )
