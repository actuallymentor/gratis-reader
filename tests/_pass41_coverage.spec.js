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

const get_store_count = async ( page, store_name ) => page.evaluate( async ( name ) => {
    return new Promise( resolve => {
        const req = indexedDB.open( `gratis_reader` )
        req.onsuccess = () => {
            const tx = req.result.transaction( name, `readonly` )
            const count_req = tx.objectStore( name ).count()
            count_req.onsuccess = () => resolve( count_req.result )
            count_req.onerror = () => resolve( -1 )
        }
        req.onerror = () => resolve( -1 )
    } )
}, store_name )

const accept_confirmation = async ( page, expected_message, action ) => {

    const handled = new Promise( ( resolve, reject ) => {
        page.once( `dialog`, async dialog => {
            try {
                expect( dialog.type() ).toBe( `confirm` )
                expect( dialog.message() ).toBe( expected_message )
                await dialog.accept()
                resolve()
            } catch( error ) {
                reject( error )
            }
        } )
    } )

    await action()
    await handled

}

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

        // Verify token_usage was stored in IDB
        await expect.poll(
            () => get_store_count( page, `token_usage` ),
            { timeout: 30_000 }
        ).toBeGreaterThan( 0 )

        // Go back to library
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        // Delete the book
        await accept_confirmation(
            page,
            `Remove "Smart work beats hard work" from your library?`,
            () => page.getByRole( `button`, { name: `Remove` } ).click()
        )

        // Verify token_usage was cleaned up
        await expect.poll( () => get_store_count( page, `token_usage` ) ).toBe( 0 )

    } )


    // ── 2. Clear cache actually empties IndexedDB translations ──

    test( `BW209 clear cache button empties translations from IndexedDB`, async ( { page } ) => {

        // Upload book and read to populate translation cache
        await upload_demo_book( page )
        await open_reader( page )

        // Verify translations were cached
        await expect.poll(
            () => get_store_count( page, `translations` ),
            { timeout: 30_000 }
        ).toBeGreaterThan( 0 )

        // Go back to library and open settings
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Accept confirmation dialog and clear cache
        await accept_confirmation(
            page,
            `Clear all cached translations? This cannot be undone.`,
            () => page.getByRole( `button`, { name: `Clear Translation Cache` } ).click()
        )

        // Verify translations store is now empty
        await expect( page.getByText( `Translation cache cleared` ) ).toBeVisible()
        await expect.poll( () => get_store_count( page, `translations` ) ).toBe( 0 )

    } )


    // ── 3. Explanation popover shows proper mock content ──

    test( `BW210 explanation popover shows distinct explanation content`, async ( { page } ) => {

        await upload_demo_book( page )
        await open_reader( page )

        // Wait for translations
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( first_sentence ).toContainText( `[TRANSLATED]`, { timeout: 30_000 } )

        // Open the explanation from the selected word's sheet.
        await first_sentence.locator( `[data-translation-word-index]` ).first().click()
        await page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } ).click()

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

        // Navigate to chapter 2 to ensure progress is saved
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

        // Verify progress exists in IDB
        await expect.poll( () => get_store_count( page, `progress` ) ).toBeGreaterThan( 0 )

        // Go back to library and delete
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        await accept_confirmation(
            page,
            `Remove "Smart work beats hard work" from your library?`,
            () => page.getByRole( `button`, { name: `Remove` } ).click()
        )

        // Verify progress was cleaned up
        await expect.poll( () => get_store_count( page, `progress` ) ).toBe( 0 )

    } )


    // ── 5. Deleting a book removes orphaned translations from IDB ──

    test( `BW212 deleting a book removes translations from IndexedDB`, async ( { page } ) => {

        // Upload and read to populate translation cache
        await upload_demo_book( page )
        await open_reader( page )

        // Verify translations exist
        await expect.poll(
            () => get_store_count( page, `translations` ),
            { timeout: 30_000 }
        ).toBeGreaterThan( 0 )

        // Go back and delete the book
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        await accept_confirmation(
            page,
            `Remove "Smart work beats hard work" from your library?`,
            () => page.getByRole( `button`, { name: `Remove` } ).click()
        )

        // Verify translations were cleaned up
        await expect.poll( () => get_store_count( page, `translations` ) ).toBe( 0 )

    } )

} )
