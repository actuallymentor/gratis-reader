import { test, expect } from '@playwright/test'
import {
    setup_api_key,
    upload_demo_book,
    open_reader,
    mock_openrouter,
    clear_storage,
    get_current_translation_entries
} from './helpers/setup.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`

const translation_cache_count = page => page.evaluate( async () => {
    return new Promise( ( resolve ) => {
        const request = indexedDB.open( `gratis_reader` )
        request.onsuccess = event => {
            const database = event.target.result
            const transaction = database.transaction( `translations`, `readonly` )
            const count_request = transaction.objectStore( `translations` ).count()
            count_request.onsuccess = () => resolve( count_request.result )
            count_request.onerror = () => resolve( 0 )
        }
        request.onerror = () => resolve( 0 )
    } )
} )

const wait_for_mocked_translations = async page => {
    const sentences = page.locator( `span[data-sentence-id]` )
    const sentence_count = await sentences.count()
    const translated_sentences = sentences.filter( { hasText: `[TRANSLATED]` } )

    await expect( translated_sentences ).toHaveCount( sentence_count, { timeout: 15_000 } )
    await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThanOrEqual( sentence_count )
}

test.describe( `Translation (mocked)`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    const enter_reader = async ( page ) => {

        await mock_openrouter( page )
        await open_reader( page )

    }

    test( `displays translated text when API responds`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for translations to appear — mocked translations start with [TRANSLATED]
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

    } )

    test( `retries failed sentence translations periodically`, async ( { page } ) => {

        const attempts_by_sentence = {}

        await page.route( CHAT_URL, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence_match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`

            attempts_by_sentence[sentence] = ( attempts_by_sentence[sentence] || 0 ) + 1

            if( attempts_by_sentence[sentence] === 1 ) {
                await route.fulfill( { status: 500, body: `Temporary translation failure` } )
                return
            }

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[RETRIED] ${ sentence }` } } ],
                    usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
                } )
            } )
        } )

        await open_reader( page )

        await expect( page.getByText( /\[RETRIED\]/ ).first() ).toBeVisible( { timeout: 20_000 } )
        expect( Object.values( attempts_by_sentence ).some( attempts => attempts > 1 ) ).toBe( true )

    } )

    test( `requests translation from OpenRouter when page loads`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
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

        const translation_request = page.waitForRequest( CHAT_URL )
        await open_reader( page )
        const request = await translation_request

        expect( request.postData() ).toContain( `Translate this sentence:` )

    } )

    test( `caches translations in IndexedDB`, async ( { page } ) => {

        await enter_reader( page )
        await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )

    } )

    test( `serves cached translations on second load (no API call)`, async ( { page } ) => {

        // First load — populate cache
        await enter_reader( page )
        await wait_for_mocked_translations( page )
        const cached_entries = await get_current_translation_entries( page )
        expect( cached_entries.length ).toBeGreaterThan( 0 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )
        await page.clock.install()

        // Any cache miss receives a distinctive response that would overwrite
        // the corresponding persisted current-chapter record.
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
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
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        // Advance the translation debounce, then await the complete cache-check
        // cycle before asserting that none of the cached sentences hit the API.
        await page.clock.runFor( 300 )
        const translating = page.getByText( `Translating...`, { exact: true } )
        await expect( translating ).toBeVisible()
        await expect( translating ).not.toBeVisible()

        // Should see [TRANSLATED] from cache, not [SECOND] from new API
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()
        await expect( page.getByText( `[SECOND]`, { exact: true } ) ).toHaveCount( 0 )
        expect( await get_current_translation_entries( page ) ).toEqual( cached_entries )

    } )

    test( `serves cached translations when API is unavailable (offline mode)`, async ( { page } ) => {

        // First load — populate cache with mocked translations
        await mock_openrouter( page )
        await open_reader( page )

        // Wait for translations to populate cache
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Now block all API calls to simulate offline
        await page.route( `**/openrouter.ai/**`, route => route.abort( `connectionrefused` ) )

        // Re-open the book — cached translations should still show
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Cached translations should be visible
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()

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

        // A persisted translation proves that a live response was processed.
        await expect.poll(
            () => translation_cache_count( page ),
            { timeout: 30_000 }
        ).toBeGreaterThan( 0 )

        // At least some sentences should now be translated
        const text = await page.evaluate( () => document.querySelector( `main` )?.innerText || `` )
        expect( text.length ).toBeGreaterThan( 50 )

    } )

} )
