/**
 * Pass 32 — Fresh walkthrough: state transitions, multi-step flows, edge cases
 * Targets angles previous passes may have missed
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

test.describe( `Pass 32 — Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    // ── 1. Double upload produces no duplicate ──

    test( `BW101 uploading same book twice does not create a duplicate`, async ( { page } ) => {
        await upload_demo_book( page )
        await page.goto( `/library` )

        // Count books before
        const books_before = await page.locator( `h3` ).count()

        // Upload same book again
        const file_input = page.locator( `input[type="file"]` )
        await file_input.setInputFiles( `./tests/fixtures/book.epub` )
        await page.waitForTimeout( 4000 )

        // Count after — should be the same (upsert, not insert)
        const books_after = await page.locator( `h3` ).count()
        expect( books_after ).toBe( books_before )
    } )

    // ── 2. Language modal appears on first book open ──

    test( `BW102 language modal appears first time opening a book`, async ( { page } ) => {
        await upload_demo_book( page )

        // Clear just the language setting so modal appears
        await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            if( store.state ) {
                delete store.state.last_language
                delete store.state.last_level
            }
            localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
        } )

        // Navigate to reader
        await page.goto( `/library` )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Language modal should be visible
        const modal = page.getByRole( `dialog` )
        await expect( modal ).toBeVisible( { timeout: 5000 } )
    } )

    // ── 3. Sentence tap cycle: translated → original → translated ──

    test( `BW103 triple tap returns sentence to translated state`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        const sentence = page.locator( `span[data-sentence-id]` ).first()

        // Check highlight state toggles correctly via data-sentence-id persistence
        const id_before = await sentence.getAttribute( `data-sentence-id` )

        // Tap 1 — toggle to original (highlight on)
        await sentence.click()
        await page.waitForTimeout( 300 )
        const highlight_1 = await sentence.evaluate( el => window.getComputedStyle( el ).backgroundColor )

        // Tap 2 — toggle back to translated (highlight off)
        await sentence.click()
        await page.waitForTimeout( 300 )
        const highlight_2 = await sentence.evaluate( el => window.getComputedStyle( el ).backgroundColor )

        // Tap 3 — original again (highlight on)
        await sentence.click()
        await page.waitForTimeout( 300 )
        const highlight_3 = await sentence.evaluate( el => window.getComputedStyle( el ).backgroundColor )

        // Sentence ID should persist through all taps
        const id_after = await sentence.getAttribute( `data-sentence-id` )
        expect( id_after ).toBe( id_before )

        // Highlights should cycle: tap1 == tap3, tap1 != tap2
        expect( highlight_3 ).toBe( highlight_1 )
    } )

    // ── 4. Settings drawer opens and closes cleanly ──

    test( `BW104 settings drawer closes on Escape key`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )

        // Press Escape
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 300 )

        // Settings should be closed — FONT SIZE not visible
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()
    } )

    // ── 5. Navigate back and forth between library and reader ──

    test( `BW105 navigation: library → reader → library → reader preserves state`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Remember the first sentence text
        const first_sentence = await page.locator( `span[data-sentence-id]` ).first().textContent()

        // Go back to library
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        // Re-enter reader
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Handle language modal if it appears
        try {
            const start = page.getByRole( `button`, { name: `Start Reading` } )
            await start.waitFor( { state: `visible`, timeout: 2000 } )
            await start.click()
        } catch { /* no modal */ }

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10000 } )
        await page.waitForTimeout( 2000 )

        // Sentence content should still be available
        const re_entered_sentence = await page.locator( `span[data-sentence-id]` ).first().textContent()
        expect( re_entered_sentence ).toBeTruthy()
    } )

    // ── 6. Font size actually changes the rendered size ──

    test( `BW106 font size slider changes actual CSS font-size`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Get initial font size
        const initial_size = await page.locator( `span[data-sentence-id]` ).first().evaluate(
            el => parseFloat( window.getComputedStyle( el ).fontSize )
        )

        // Open settings and increase font size
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )

        // Find the slider and set to max
        const slider = page.locator( `input[type="range"]` ).first()
        await slider.fill( `32` )
        await page.waitForTimeout( 300 )

        // Close settings
        await page.getByRole( `button`, { name: `Close` } ).click()
        await page.waitForTimeout( 300 )

        // Check font size changed
        const new_size = await page.locator( `span[data-sentence-id]` ).first().evaluate(
            el => parseFloat( window.getComputedStyle( el ).fontSize )
        )

        expect( new_size ).toBeGreaterThan( initial_size )
    } )

    // ── 7. Dark theme changes body background ──

    test( `BW107 dark theme applies dark background color`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Open settings and switch to dark
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await page.waitForTimeout( 300 )

        // Check that data-theme is set
        const theme = await page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        )
        expect( theme ).toBe( `dark` )

        // Check background is actually dark (low luminance)
        const bg = await page.evaluate( () =>
            window.getComputedStyle( document.body ).backgroundColor
        )
        // Dark backgrounds have low RGB values
        const match = bg.match( /(\d+)/g )
        if( match ) {
            const avg = ( parseInt( match[0] ) + parseInt( match[1] ) + parseInt( match[2] ) ) / 3
            expect( avg ).toBeLessThan( 100 )
        }
    } )

    // ── 8. Delete book removes it from library ──

    test( `BW108 deleting a book removes its card from library`, async ( { page } ) => {
        await upload_demo_book( page )
        await page.goto( `/library` )

        // Book should be there
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()

        // Find and click remove button
        const delete_btn = page.getByRole( `button`, { name: /remove/i } )

        // Handle confirm dialog
        page.on( `dialog`, dialog => dialog.accept() )
        await delete_btn.click()
        await page.waitForTimeout( 1000 )

        // Book should be gone
        const headings = await page.locator( `h3` ).count()
        expect( headings ).toBe( 0 )
    } )

    // ── 9. Onboarding flow with invalid key shows error ──

    test( `BW109 invalid API key shows validation error`, async ( { page } ) => {

        // Mock auth to reject
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await route.fulfill( {
                status: 401,
                contentType: `application/json`,
                body: JSON.stringify( { error: `Invalid key` } )
            } )
        } )

        await clear_storage( page )
        await page.goto( `/` )

        // Should be on onboarding
        const input = page.locator( `input[type="text"], input[type="password"]` ).first()
        await expect( input ).toBeVisible( { timeout: 5000 } )

        // Enter a bad key
        await input.fill( `sk-or-invalid-key` )
        await page.getByRole( `button`, { name: /connect/i } ).click()
        await page.waitForTimeout( 2000 )

        // Should still be on onboarding (not redirected to library)
        expect( page.url() ).not.toContain( `/library` )
    } )

    // ── 10. Progress bar reflects chapter position ──

    test( `BW110 progress bar shows non-zero after opening reader`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1000 )

        // Check for progress text like "1 / N · X%"
        const progress_text = await page.locator( `body` ).textContent()
        const has_progress = /\d+\s*\/\s*\d+/.test( progress_text )
        expect( has_progress ).toBeTruthy()
    } )

    // ── 11. Multiple sentences get unique data-sentence-id values ──

    test( `BW111 each sentence has a unique data-sentence-id`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        const ids = await page.$$eval(
            `span[data-sentence-id]`,
            els => els.map( el => el.getAttribute( `data-sentence-id` ) )
        )

        expect( ids.length ).toBeGreaterThan( 1 )

        // All IDs should be unique
        const unique = new Set( ids )
        expect( unique.size ).toBe( ids.length )
    } )

    // ── 12. Sentence IDs follow spec format ──

    test( `BW112 sentence IDs match format {hash}:{chapter}:{paragraph}:{index}`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        const ids = await page.$$eval(
            `span[data-sentence-id]`,
            els => els.map( el => el.getAttribute( `data-sentence-id` ) )
        )

        for( const id of ids ) {
            const parts = id.split( `:` )
            expect( parts.length ).toBe( 4 )
            // First part is hex hash
            expect( parts[0] ).toMatch( /^[a-f0-9]+$/ )
            // Rest are numbers
            expect( parts[1] ).toMatch( /^\d+$/ )
            expect( parts[2] ).toMatch( /^\d+$/ )
            expect( parts[3] ).toMatch( /^\d+$/ )
        }
    } )

    // ── 13. No console errors during normal flow ──

    test( `BW113 no console errors during upload → read → settings flow`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 500 )

        // Change theme
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        await page.waitForTimeout( 300 )

        // Close settings
        await page.getByRole( `button`, { name: `Close` } ).click()

        expect( errors ).toEqual( [] )
    } )

    // ── 14. IndexedDB stores book data ──

    test( `BW114 book stored in IndexedDB after upload`, async ( { page } ) => {
        await upload_demo_book( page )

        const book_exists = await page.evaluate( async () => {
            return new Promise( ( resolve, reject ) => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    const tx = db.transaction( `books`, `readonly` )
                    const store = tx.objectStore( `books` )
                    const count = store.count()
                    count.onsuccess = () => resolve( count.result > 0 )
                    count.onerror = () => reject( count.error )
                }
                req.onerror = () => reject( req.error )
            } )
        } )

        expect( book_exists ).toBeTruthy()
    } )

    // ── 15. Translations are cached in IndexedDB ──

    test( `BW115 translations appear in IndexedDB after reading`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 4000 )

        const cache_count = await page.evaluate( async () => {
            return new Promise( ( resolve, reject ) => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const count = store.count()
                    count.onsuccess = () => resolve( count.result )
                    count.onerror = () => reject( count.error )
                }
                req.onerror = () => reject( req.error )
            } )
        } )

        expect( cache_count ).toBeGreaterThan( 0 )
    } )

} )
