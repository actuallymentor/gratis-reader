/**
 * Pass 41 — Coverage gap tests
 *
 * Fills concrete gaps identified in the test audit:
 * - Token usage cleanup on book deletion
 * - Clear cache actually clears IndexedDB translations
 * - Explanation popover receives proper mock content
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

test.describe( `Pass 41 — Coverage Gaps`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )


    // ── 1. Token usage is cleaned up when a book is deleted ──

    test( `BW208 deleting a book removes token_usage from IndexedDB`, async ( { page } ) => {

        // Upload book and read it to generate token usage
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 5000 )

        // Verify token_usage was stored in IDB
        const usage_before = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `token_usage`, `readonly` )
                    const store = tx.objectStore( `token_usage` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( 0 )
                }
                req.onerror = () => resolve( 0 )
            } )
        } )

        expect( usage_before ).toBeGreaterThan( 0 )

        // Go back to library
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        // Delete the book
        page.on( `dialog`, dialog => dialog.accept() )
        await page.getByRole( `button`, { name: `Remove` } ).click()
        await page.waitForTimeout( 2000 )

        // Verify token_usage was cleaned up
        const usage_after = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `token_usage`, `readonly` )
                    const store = tx.objectStore( `token_usage` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( -1 )
                }
                req.onerror = () => resolve( -1 )
            } )
        } )

        expect( usage_after ).toBe( 0 )

    } )


    // ── 2. Clear cache actually empties IndexedDB translations ──

    test( `BW209 clear cache button empties translations from IndexedDB`, async ( { page } ) => {

        // Upload book and read to populate translation cache
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 5000 )

        // Verify translations were cached
        const cache_before = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( 0 )
                }
                req.onerror = () => resolve( 0 )
            } )
        } )

        expect( cache_before ).toBeGreaterThan( 0 )

        // Go back to library and open settings
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Accept confirmation dialog and clear cache
        page.on( `dialog`, dialog => dialog.accept() )
        await page.getByRole( `button`, { name: `Clear Translation Cache` } ).click()
        await page.waitForTimeout( 2000 )

        // Verify translations store is now empty
        const cache_after = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( -1 )
                }
                req.onerror = () => resolve( -1 )
            } )
        } )

        expect( cache_after ).toBe( 0 )

    } )


    // ── 3. Explanation popover shows proper mock content ──

    test( `BW210 explanation popover shows distinct explanation content`, async ( { page } ) => {

        await upload_demo_book( page )
        await open_reader( page )

        // Wait for translations
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( first_sentence ).toContainText( `[TRANSLATED]`, { timeout: 30_000 } )

        // Right-click to open explanation
        await first_sentence.click( { button: `right` } )

        // Should show the explanation popover with [EXPLANATION] content from our mock
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 10_000 } )

        // The mock returns "[EXPLANATION] This sentence means something interesting..."
        // Verify the explanation content is present (not a generic translation response)
        await expect( page.getByText( /something interesting/i ) ).toBeVisible( { timeout: 10_000 } )

    } )


    // ── 4. Deleting a book also removes progress from IndexedDB ──

    test( `BW211 deleting a book removes progress from IndexedDB`, async ( { page } ) => {

        // Upload and read to generate progress
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 3000 )

        // Navigate to chapter 2 to ensure progress is saved
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        // Verify progress exists in IDB
        const progress_before = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `progress`, `readonly` )
                    const store = tx.objectStore( `progress` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( 0 )
                }
                req.onerror = () => resolve( 0 )
            } )
        } )

        expect( progress_before ).toBeGreaterThan( 0 )

        // Go back to library and delete
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        page.on( `dialog`, dialog => dialog.accept() )
        await page.getByRole( `button`, { name: `Remove` } ).click()
        await page.waitForTimeout( 2000 )

        // Verify progress was cleaned up
        const progress_after = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `progress`, `readonly` )
                    const store = tx.objectStore( `progress` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( -1 )
                }
                req.onerror = () => resolve( -1 )
            } )
        } )

        expect( progress_after ).toBe( 0 )

    } )


    // ── 5. Deleting a book removes orphaned translations from IDB ──

    test( `BW212 deleting a book removes translations from IndexedDB`, async ( { page } ) => {

        // Upload and read to populate translation cache
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 5000 )

        // Verify translations exist
        const trans_before = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( 0 )
                }
                req.onerror = () => resolve( 0 )
            } )
        } )

        expect( trans_before ).toBeGreaterThan( 0 )

        // Go back and delete the book
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        page.on( `dialog`, dialog => dialog.accept() )
        await page.getByRole( `button`, { name: `Remove` } ).click()
        await page.waitForTimeout( 2000 )

        // Verify translations were cleaned up
        const trans_after = await page.evaluate( async () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = ( e ) => {
                    const db = e.target.result
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const count_req = store.count()
                    count_req.onsuccess = () => resolve( count_req.result )
                    count_req.onerror = () => resolve( -1 )
                }
                req.onerror = () => resolve( -1 )
            } )
        } )

        expect( trans_after ).toBe( 0 )

    } )

} )
