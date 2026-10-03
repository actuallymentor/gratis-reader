import { test, expect, open_seeded_reader, SEEDED_BOOK_ID } from './helpers/app_fixture.js'
import {
    setup_api_key,
    upload_demo_book,
    mock_openrouter,
    get_current_translation_entries
} from './helpers/setup.js'
import { CHAT_URL, parse_chat_request, fulfil_chat, answer_request } from './helpers/openrouter_mock.js'
import { expect_chapter } from './helpers/reader.js'
import { estimate_cost, format_cost, format_tokens } from '../src/modules/pricing.js'

const DEFAULT_MODEL = `openai/gpt-6-luna`
const TRANSLATING = /^Translating · \d+\/\d+$/
const OFFLINE_BANNER = `Offline — showing cached translations`

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

const translation_cache_keys = page => page.evaluate( async () => {
    return new Promise( ( resolve ) => {
        const request = indexedDB.open( `gratis_reader` )
        request.onsuccess = event => {
            const all = event.target.result.transaction( `translations`, `readonly` ).objectStore( `translations` ).getAllKeys()
            all.onsuccess = () => resolve( all.result )
            all.onerror = () => resolve( [] )
        }
        request.onerror = () => resolve( [] )
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
    await expect( page.getByText( TRANSLATING ) ).not.toBeVisible()
    await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )
}

// Holds every chat request until `release()`; later requests answer immediately
const hold_chat = async ( page, respond ) => {
    let release
    const gate = new Promise( resolve => {
        release = resolve
    } )
    await page.route( CHAT_URL, async route => {
        await gate
        await respond( route ).catch( () => {} )
    } )
    return release
}

const echo = route => fulfil_chat( route, answer_request( parse_chat_request( route.request().postDataJSON() ) ) )

// Sets the persisted reader level on the seed page, before the reader reads its settings
const seed_level = ( page, level ) => page.evaluate( level => {
    const saved = JSON.parse( localStorage.getItem( `settings-storage` ) )
    saved.state.last_level = level
    localStorage.setItem( `settings-storage`, JSON.stringify( saved ) )
}, level )

test.describe( `Translation (mocked)`, () => {

    test.use( { app_state: `reader` } )

    const enter_reader = async ( page ) => {

        await mock_openrouter( page )
        await open_seeded_reader( page )

    }

    test( `renders translations and caches them under sentence:language:level keys`, async ( { page } ) => {

        await enter_reader( page )

        // Mocked translations start with [TRANSLATED]
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        await expect.poll( () => translation_cache_count( page ) ).toBeGreaterThan( 0 )

        // Every sentence entry is `{hash}:{chapter}:{paragraph}:{sentence}:{language}:{level}`
        const keys = ( await translation_cache_keys( page ) ).filter( key => !key.startsWith( `word:` ) )
        expect( keys.length ).toBeGreaterThan( 0 )
        for( const key of keys ) expect( key ).toMatch( /^[a-f0-9]+:\d+:\d+:\d+:Spanish:a2$/ )

        // The rendered sentences own those keys
        const rendered_ids = await page.locator( `span[data-sentence-id]` ).evaluateAll( spans => spans.map( span => span.dataset.sentenceId ) )
        expect( keys.some( key => rendered_ids.includes( key.replace( /:Spanish:a2$/, `` ) ) ) ).toBe( true )

    } )

    test( `retries failed sentence translations periodically`, async ( { page } ) => {

        const attempts_by_sentence = {}
        const page_errors = []
        page.on( `pageerror`, error => page_errors.push( error.message ) )

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

        // Mixed failures and successes never surface as uncaught errors
        expect( page_errors ).toEqual( [] )

    } )

    test( `sends an authenticated request with paragraph context and the A2 teacher prompt`, async ( { page } ) => {

        await page.route( CHAT_URL, echo )

        const translation_request = page.waitForRequest( request =>
            request.url().includes( `/chat/completions` ) &&
            [ `sentence`, `sentence_batch` ].includes( parse_chat_request( request.postDataJSON() ).kind )
        )
        await open_seeded_reader( page )
        const captured = await translation_request
        const body = captured.postDataJSON()
        const request = parse_chat_request( body )

        // Headers: bearer key from settings, JSON body
        const headers = await captured.allHeaders()
        expect( headers[`authorization`] ).toBe( `Bearer sk-or-test-fake-key` )
        expect( headers[`content-type`] ).toContain( `application/json` )

        // Body: default model plus exactly one system and one user message
        expect( body.model ).toBe( DEFAULT_MODEL )
        expect( body.messages.map( message => message.role ).sort() ).toEqual( [ `system`, `user` ] )

        // User prompt: the paragraph travels as context, and holds the sentences being translated
        expect( request.sentences.length ).toBeGreaterThan( 0 )
        expect( request.context ).toBeTruthy()
        for( const sentence of request.sentences ) expect( request.context ).toContain( sentence )

        // System prompt: teacher role, rewrite step, output-only rule, default level
        expect( request.system ).toContain( `You are a language teacher helping a student learn Spanish` )
        expect( request.system ).toMatch( /rewrite/i )
        expect( request.system ).toContain( `Output ONLY the translated/rewritten sentence` )
        expect( request.system ).toContain( `at the Primary Schooler level` )
        expect( request.system ).toContain( `(CEFR A2)` )

    } )

    const level_prompts = [
        { level: `a0`, label: `Caveman`, cefr: `A0`, rule: `Grammar may be rough or incomplete` },
        { level: `a1`, label: `Toddler`, cefr: `A1`, rule: `Use only the most basic vocabulary` },
        { level: `c1-c2`, label: `Adult`, cefr: `C1-C2`, rule: `Preserve style, tone, literary devices, and nuance` }
    ]

    for( const { level, label, cefr, rule } of level_prompts ) {

        test( `${ cefr } system prompt carries the ${ label } rules`, async ( { page } ) => {

            await seed_level( page, level )
            await page.route( CHAT_URL, echo )

            const translation_request = page.waitForRequest( request =>
                request.url().includes( `/chat/completions` ) &&
                [ `sentence`, `sentence_batch` ].includes( parse_chat_request( request.postDataJSON() ).kind )
            )
            await open_seeded_reader( page )
            const { system } = parse_chat_request( ( await translation_request ).postDataJSON() )

            expect( system ).toContain( `at the ${ label } level` )
            expect( system ).toContain( `(CEFR ${ cefr })` )
            expect( system ).toContain( rule )
            expect( system ).not.toContain( `Primary Schooler` )

        } )

    }

    test( `shows "Translating · n/m" while requests are held, then the translations`, async ( { page } ) => {

        const release = await hold_chat( page, echo )
        await open_seeded_reader( page )

        // Nothing has answered yet, so none of the chapter's sentences count as translated
        await expect( page.getByText( /^Translating · 0\/[1-9]\d*$/ ) ).toBeVisible()
        await expect( page.getByText( /\[TRANSLATED\]/ ) ).toHaveCount( 0 )

        release()
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()

    } )

    const failures = [
        { name: `HTTP 500`, response: { status: 500, contentType: `application/json`, body: JSON.stringify( { error: `Internal server error` } ) } },
        { name: `malformed HTML`, response: { status: 200, contentType: `text/html`, body: `<html><body>Service Unavailable</body></html>` } }
    ]

    for( const { name, response } of failures ) {

        test( `${ name } answers: indicator clears, source text stays, no page errors`, async ( { page } ) => {

            const page_errors = []
            page.on( `pageerror`, error => page_errors.push( error.message ) )

            // Hold the failures until the in-flight state is observable
            const release = await hold_chat( page, route => route.fulfill( response ) )
            const failed_response = page.waitForResponse( CHAT_URL )
            await open_seeded_reader( page )
            await expect( page.getByText( TRANSLATING ) ).toBeVisible()

            release()
            await failed_response
            await expect( page.getByText( TRANSLATING ) ).not.toBeVisible( { timeout: 15_000 } )

            // The untranslated chapter stays readable and interactive
            const first_sentence = page.locator( `span[data-sentence-id]` ).first()
            await first_sentence.click()
            await expect( first_sentence ).toBeVisible()
            expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )
            await expect( page.locator( `[data-translation-word]` ) ).toHaveCount( 0 )
            expect( page_errors ).toEqual( [] )

        } )

    }

    test( `rapid chapter changes while translations are held end on the right chapter`, async ( { page } ) => {

        const page_errors = []
        page.on( `pageerror`, error => page_errors.push( error.message ) )

        const release = await hold_chat( page, echo )
        await open_seeded_reader( page )

        const next = page.getByRole( `button`, { name: `Next`, exact: true } )
        await next.click()
        await next.click()
        await page.getByRole( `button`, { name: `Prev`, exact: true } ).click()
        await expect_chapter( page, 1 )

        // Held answers from abandoned chapters must not break the current one
        release()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( `[TRANSLATED]` )
        await expect_chapter( page, 1 )
        expect( page_errors ).toEqual( [] )

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

    test( `offline banner follows the network and keeps the chapter on screen`, async ( { page } ) => {

        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()
        const sentence_count = await page.locator( `span[data-sentence-id]` ).count()

        await page.context().setOffline( true )
        await expect( page.getByText( OFFLINE_BANNER, { exact: true } ) ).toBeVisible()
        await expect( page.getByText( /^Offline · \d+\/\d+ cached$/ ) ).toBeVisible()
        await expect( page.locator( `span[data-sentence-id]` ) ).toHaveCount( sentence_count )

        await page.context().setOffline( false )
        await expect( page.getByText( OFFLINE_BANNER, { exact: true } ) ).not.toBeVisible()
        await expect( page.getByText( /^Offline · / ) ).not.toBeVisible()

    } )

    test( `next chapter renders from the read-ahead cache while the API is down`, async ( { page } ) => {

        await page.route( CHAT_URL, echo )
        await open_seeded_reader( page )
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( first_sentence ).toContainText( `[TRANSLATED]` )

        // Near the chapter boundary the word window reaches into the next chapter
        await page.locator( `span[data-sentence-id]` ).last().scrollIntoViewIfNeeded()
        await expect.poll( () => page.evaluate( async () => {
            const { get_translation } = await import( `/src/modules/cache.js` )
            const [ hash, chapter ] = document.querySelector( `[data-sentence-id]` ).dataset.sentenceId.split( `:` )
            return !!await get_translation( `${ hash }:${ Number( chapter ) + 1 }:0:0:Spanish:a2` )
        } ), { timeout: 15_000 } ).toBe( true )

        // From here on chapter 2 can only be served from its cache
        await page.unroute( CHAT_URL )
        await page.route( CHAT_URL, route => route.abort( `connectionrefused` ) )
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )

        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        await expect( first_sentence ).toContainText( `[TRANSLATED]` )

    } )

} )

test.describe( `Token usage`, () => {

    test.use( { app_state: `reader` } )

    // Large enough per call that the footer shows both "K" tokens and a real cost
    const USAGE = { prompt_tokens: 3000, completion_tokens: 1000, total_tokens: 4000 }

    const footer_text = calls => `${ format_tokens( calls * 4000 ) } tokens · ${ format_cost( estimate_cost( calls * 3000, calls * 1000, DEFAULT_MODEL ) ) }`

    const stored_tokens = page => page.evaluate( async book_id => {
        const { get_token_usage } = await import( `/src/modules/cache.js` )
        const usage = await get_token_usage( book_id )
        return usage ? usage.prompt_tokens + usage.completion_tokens : 0
    }, SEEDED_BOOK_ID )

    test( `footer sums every request's tokens and cost, grows on navigation, survives re-entry`, async ( { page } ) => {

        const calls = { count: 0 }
        await page.route( CHAT_URL, async route => {
            calls.count++
            await fulfil_chat( route, answer_request( parse_chat_request( route.request().postDataJSON() ) ), USAGE )
        } )

        const tokens = page.locator( `footer` ).getByText( / tokens · / )

        // Footer and IndexedDB agree with the usage of every answered request
        const expect_usage_settled = () => expect.poll( async () => {
            const { count } = calls
            const shown = ( await tokens.allTextContents() ).join( `` ).replace( /\s+/g, ` ` ).trim()
            return count > 0 && shown === footer_text( count ) && await stored_tokens( page ) === count * 4000
        }, { timeout: 15_000 } ).toBe( true )

        await open_seeded_reader( page )
        await expect_usage_settled()
        expect( await tokens.textContent() ).toMatch( /K tokens · ~\$\d/ )
        const before_navigation = calls.count

        // A new chapter brings new read-ahead requests and more usage
        await page.keyboard.press( `ArrowRight` )
        await expect_chapter( page, 1 )
        await expect.poll( () => calls.count ).toBeGreaterThan( before_navigation )
        await expect_usage_settled()
        const shown = footer_text( calls.count )

        // Re-entry with the API down: the total comes back from IndexedDB unchanged
        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library` )
        await page.unroute( CHAT_URL )
        await page.route( CHAT_URL, route => route.abort( `connectionrefused` ) )
        await open_seeded_reader( page )
        await expect( tokens ).toHaveText( shown )

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
