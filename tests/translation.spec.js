import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import {
    setup_api_key,
    upload_demo_book,
    mock_openrouter,
    get_current_translation_entries
} from './helpers/setup.js'
import { CHAT_URL, parse_chat_request, fulfil_chat, answer_request } from './helpers/openrouter_mock.js'

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
    // Only the reading window needs translations; the rest of the chapter stays untouched.
    await expect.poll( () => page.locator( `span[data-sentence-id]` ).evaluateAll( sentences => {
        const top = document.querySelector( `header` ).getBoundingClientRect().bottom
        const bottom = document.querySelector( `[data-reader-dock]` ).getBoundingClientRect().top
        const visible = sentences.filter( sentence => [ ...sentence.getClientRects() ].some( rect =>
            rect.height > 0 && rect.bottom > top && rect.top < bottom
        ) )
        return visible.length > 0 && visible.every( sentence => sentence.innerText.includes( `[TRANSLATED]` ) )
    } ), { timeout: 15_000 } ).toBe( true )
    await page.clock.runFor( 600 )
    await expect( page.getByText( /^Translating · \d+\/\d+$/ ) ).not.toBeVisible()
    await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )
}

test.describe( `Translation (mocked)`, () => {

    test.use( { app_state: `reader` } )

    const enter_reader = async ( page ) => {

        await mock_openrouter( page )
        await open_seeded_reader( page )

    }

    test( `displays translated text when API responds`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for translations to appear — mocked translations start with [TRANSLATED]
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

    } )

    test( `retries failed sentence translations periodically`, async ( { page } ) => {

        const attempts_by_sentence = {}

        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )

            // A batch fails as a whole when any of its sentences is on its first attempt
            const attempts = request.sentences.map( sentence => {
                attempts_by_sentence[sentence] = ( attempts_by_sentence[sentence] || 0 ) + 1
                return attempts_by_sentence[sentence]
            } )

            if( attempts.includes( 1 ) ) {
                await route.fulfill( { status: 500, body: `Temporary translation failure` } )
                return
            }

            await fulfil_chat( route, answer_request( request, { sentence: text => `[RETRIED] ${ text }` } ) )
        } )

        await open_seeded_reader( page )

        await expect( page.getByText( /\[RETRIED\]/ ).first() ).toBeVisible( { timeout: 20_000 } )
        expect( Object.values( attempts_by_sentence ).some( attempts => attempts > 1 ) ).toBe( true )

    } )

    test( `requests translation from OpenRouter when page loads`, async ( { page } ) => {

        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            await fulfil_chat( route, answer_request( request, { sentence: text => `[MOCK] ${ text }` } ) )
        } )

        const translation_request = page.waitForRequest( CHAT_URL )
        await open_seeded_reader( page )
        const request = parse_chat_request( ( await translation_request ).postDataJSON() )

        // Sentences of one paragraph now share a batch request, so either sentence prompt shape counts
        expect( [ `sentence`, `sentence_batch` ] ).toContain( request.kind )
        expect( request.sentences.length ).toBeGreaterThan( 0 )

    } )

    test( `caches translations in IndexedDB`, async ( { page } ) => {

        await enter_reader( page )
        await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )

    } )

    test( `serves cached translations on second load (no API call)`, async ( { page } ) => {

        // First load — populate cache
        await page.clock.install()
        await enter_reader( page )
        await wait_for_mocked_translations( page )
        const cached_entries = await get_current_translation_entries( page )
        expect( cached_entries.length ).toBeGreaterThan( 0 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Any cache miss receives a distinctive response that would overwrite
        // the corresponding persisted current-chapter record.
        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            const answer = () => `[SECOND]`
            await fulfil_chat( route, answer_request( request, { sentence: answer, word: answer, explanation: answer, meaning: answer } ) )
        } )

        // Re-open the seeded book without repeating its setup path.
        await open_seeded_reader( page )

        // Cache-only work can finish before a loading status is observable.
        await wait_for_mocked_translations( page )

        // Should see [TRANSLATED] from cache, not [SECOND] from new API
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()
        await expect( page.getByText( `[SECOND]`, { exact: true } ) ).toHaveCount( 0 )
        expect( await get_current_translation_entries( page ) ).toEqual( cached_entries )

    } )

    test( `serves cached translations when API is unavailable (offline mode)`, async ( { page } ) => {

        // First load — populate cache with mocked translations
        await mock_openrouter( page )
        await open_seeded_reader( page )

        // Wait for translations to populate cache
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Now block all API calls to simulate offline
        await page.route( `**/openrouter.ai/**`, route => route.abort( `connectionrefused` ) )

        // Re-open the seeded book — cached translations should still show
        await open_seeded_reader( page )

        // Cached translations should be visible
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()

    } )

} )

test.describe( `Translation (live)`, () => {

    test.use( { app_state: `empty` } )

    // These tests hit the real OpenRouter API
    // Run with: LIVE_API=1 npx playwright test --grep @live

    test.skip( () => !process.env.LIVE_API, `Skipped unless LIVE_API=1` )

    test.beforeEach( async ( { page } ) => {
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
