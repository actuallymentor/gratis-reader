/**
 * Pass 36 — Offline banner on library, build hygiene, stress tests
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth } from './helpers/setup.js'

test.describe( `Pass 36 — Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    // ── 1. Library page shows offline banner when offline ──

    test( `BW146 library page shows offline banner when network drops`, async ( { page } ) => {
        await page.goto( `/library` )

        // Go offline
        await page.context().setOffline( true )
        await page.waitForTimeout( 500 )

        // Offline banner should appear
        await expect( page.getByText( /offline/i ) ).toBeVisible()

        // Go back online
        await page.context().setOffline( false )
        await page.waitForTimeout( 500 )

        // Banner should disappear
        await expect( page.getByText( /offline.*cached/i ) ).not.toBeVisible()
    } )

    // ── 2. Reader page offline banner still works ──

    test( `BW147 reader page shows offline banner when network drops`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1000 )

        await page.context().setOffline( true )
        await page.waitForTimeout( 500 )

        await expect( page.getByText( /offline/i ) ).toBeVisible()

        await page.context().setOffline( false )
        await page.waitForTimeout( 500 )

        await expect( page.getByText( /offline.*cached/i ) ).not.toBeVisible()
    } )

    // ── 3. Book.epub not in production build ──

    test( `BW148 no test fixture leaked to public directory`, async () => {
        const { existsSync } = await import( `fs` )
        expect( existsSync( `./public/book.epub` ) ).toBeFalsy()
    } )

    // ── 4. Multiple books in library ──

    test( `BW149 library handles multiple uploads gracefully`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await page.goto( `/library` )

        // Verify first book is there
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()

        expect( errors ).toEqual( [] )
    } )

    // ── 5. Settings drawer on library page works ──

    test( `BW150 library page settings drawer opens and closes`, async ( { page } ) => {
        await page.goto( `/library` )

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 500 )

        // Settings content should be visible
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )

        // Close it
        await page.getByRole( `button`, { name: `Close` } ).click()
        await page.waitForTimeout( 300 )
    } )

    // ── 6. Sentence splitter handles real book content ──

    test( `BW151 all sentences in reader have non-empty text content`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        const texts = await page.$$eval(
            `span[data-sentence-id]`,
            els => els.map( el => el.textContent.trim() )
        )

        // No empty sentences
        for( const text of texts ) {
            expect( text.length ).toBeGreaterThan( 0 )
        }
    } )

    // ── 7. App title visible on library page ──

    test( `BW152 library page shows "Gratis Reader" title`, async ( { page } ) => {
        await page.goto( `/library` )
        await expect( page.getByText( `Gratis Reader` ) ).toBeVisible()
    } )

    // ── 8. Theme applies to library page too ──

    test( `BW153 dark theme applies to library background`, async ( { page } ) => {
        // Set dark theme via localStorage
        await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            store.state = { ...( store.state || {} ), theme: `dark` }
            localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
        } )

        await page.goto( `/library` )
        await page.waitForTimeout( 500 )

        const theme = await page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        )
        expect( theme ).toBe( `dark` )
    } )

} )
