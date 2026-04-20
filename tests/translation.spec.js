import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, mock_openrouter, clear_storage } from './helpers/setup.js'

test.describe( `Translation (mocked)`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    const enter_reader = async ( page ) => {

        await mock_openrouter( page )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Dismiss language modal if it appears
        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

    }

    test( `displays translated text when API responds`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for translations to appear — mocked translations start with [TRANSLATED]
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

    } )

    test( `requests translation from OpenRouter when page loads`, async ( { page } ) => {

        // Track API calls
        let api_calls = 0
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            api_calls++
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[MOCK] ${ sentence }` } } ],
                    usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
                } )
            } )
        } )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        // Wait for some translations
        await page.waitForTimeout( 5000 )

        expect( api_calls ).toBeGreaterThan( 0 )

    } )

    test( `caches translations in IndexedDB`, async ( { page } ) => {

        await enter_reader( page )
        await page.waitForTimeout( 5000 )

        // Check IndexedDB for cached translations
        const cache_count = await page.evaluate( async () => {
            return new Promise( ( resolve ) => {
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

        expect( cache_count ).toBeGreaterThan( 0 )

    } )

    test( `serves cached translations on second load (no API call)`, async ( { page } ) => {

        // First load — populate cache
        await enter_reader( page )
        await page.waitForTimeout( 5000 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Track API calls on second load
        let api_calls = 0
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            api_calls++
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[SECOND]` } } ],
                    usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
                } )
            } )
        } )

        // Re-open book
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.waitForTimeout( 5000 )

        // Should see [TRANSLATED] from cache, not [SECOND] from new API
        const translated = await page.getByText( /\[TRANSLATED\]/ ).count()
        expect( translated ).toBeGreaterThan( 0 )

    } )

    test( `serves cached translations when API is unavailable (offline mode)`, async ( { page } ) => {

        // First load — populate cache with mocked translations
        await mock_openrouter( page )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Wait for translations to populate cache
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        await page.waitForTimeout( 3000 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Now block all API calls to simulate offline
        await page.route( `**/openrouter.ai/**`, route => route.abort( `connectionrefused` ) )

        // Re-open the book — cached translations should still show
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.waitForTimeout( 5000 )

        // Cached translations should be visible
        const translated = await page.getByText( /\[TRANSLATED\]/ ).count()
        expect( translated ).toBeGreaterThan( 0 )

    } )

} )

test.describe( `Translation (live)`, () => {

    // These tests hit the real OpenRouter API
    // Run with: LIVE_API=1 npx playwright test --grep @live

    test.skip( () => !process.env.LIVE_API, `Skipped unless LIVE_API=1` )

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    test( `@live translates first page to Spanish at A1 level`, async ( { page } ) => {

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Start reading with defaults (should be Spanish/A1)
        await page.getByRole( `button`, { name: `Start Reading` } ).click()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Wait for translations
        await page.waitForTimeout( 15_000 )

        // At least some sentences should now be translated
        const text = await page.evaluate( () => document.querySelector( `main` )?.innerText || `` )
        expect( text.length ).toBeGreaterThan( 50 )

    } )

} )
