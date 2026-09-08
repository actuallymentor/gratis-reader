import { test, expect, open_seeded_reader, SEEDED_BOOK_ID } from './helpers/app_fixture.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`
const WORDS = `One two three four five six seven eight`

const install_mock = async ( page, { hold_words = false } = {} ) => {
    const calls = { words: [], translations: [], hold_words }

    await page.route( CHAT_URL, async route => {
        const body = route.request().postDataJSON()
        const prompt = body.messages.find( message => message.role === `user` ).content
        const word_match = prompt.match( /Sentence: "([\s\S]*)"\n\nWord: (.+)$/ )
        let content

        if( word_match ) {
            const [ , context, word ] = word_match
            calls.words.push( { context, word, route } )
            if( calls.hold_words ) return
            content = `Source ${ word.toLowerCase() }`
        } else {
            content = `${ Array( 8 ).fill( WORDS ).join( ` ` ) } ${ calls.translations.length + 1 }.`
            calls.translations.push( content )
        }

        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                choices: [ { message: { content } } ],
                usage: { prompt_tokens: word_match ? 25 : 0, completion_tokens: word_match ? 15 : 0 }
            } )
        } )
    } )

    return calls
}

const enable_saved_turbo = page => page.evaluate( () => {
    const saved = JSON.parse( localStorage.getItem( `settings-storage` ) )
    saved.state.turbo_mode = true
    localStorage.setItem( `settings-storage`, JSON.stringify( saved ) )
} )

// Advance beyond the settling interval so negative request assertions cover a scan.
const settle_scans = async page => {
    await page.clock.install()
    await page.clock.runFor( 500 )
}

test.describe( `Turbo Mode reader`, () => {

    test.use( { app_state: `reader`, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } )

    test( `does not preload word lookups by default`, async ( { page } ) => {
        const calls = await install_mock( page )
        await open_seeded_reader( page )
        await expect( page.locator( `[data-translation-word]` ).first() ).toBeVisible()
        await settle_scans( page )
        expect( calls.words ).toHaveLength( 0 )
    } )

    test( `warms only visible contexts and reuses them immediately on a tap`, async ( { page } ) => {
        const calls = await install_mock( page )
        await enable_saved_turbo( page )
        await open_seeded_reader( page )
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( sentence.locator( `[data-translation-word]` ).first() ).toBeVisible()
        const context = await sentence.innerText()

        // IndexedDB completion proves every foreground lookup can be served locally.
        await expect.poll( () => page.evaluate( async context => {
            const { open_db } = await import( `/src/modules/cache.js` )
            const db = await open_db()
            const entries = await new Promise( ( resolve, reject ) => {
                const request = db.transaction( `translations` ).objectStore( `translations` ).getAll()
                request.onsuccess = () => resolve( request.result )
                request.onerror = () => reject( request.error )
            } )
            return entries.filter( entry => entry.level === `word` && entry.key.endsWith( `:${ encodeURIComponent( context ) }` ) ).length
        }, context ) ).toBe( 8 )

        await expect.poll( () => page.evaluate( async book_id => {
            const { get_token_usage } = await import( `/src/modules/cache.js` )
            return ( await get_token_usage( book_id ) )?.prompt_tokens || 0
        }, SEEDED_BOOK_ID ) ).toBeGreaterThanOrEqual( 8 * 25 )

        const visible_contexts = await page.locator( `span[data-sentence-id]` ).evaluateAll( elements => {
            const top = document.querySelector( `header` ).getBoundingClientRect().bottom
            const bottom = document.querySelector( `[data-reader-dock]` ).getBoundingClientRect().top
            return elements.filter( element => [ ...element.getClientRects() ].some( rect =>
                rect.height > 0 && rect.bottom > top && rect.top < bottom
            ) ).map( element => element.innerText )
        } )
        expect( calls.words.every( call => visible_contexts.includes( call.context ) ) ).toBe( true )
        expect( calls.translations.some( translation => !visible_contexts.includes( translation ) ) ).toBe( true )

        const before_tap = calls.words.filter( call => call.context === context ).length
        // Block all new responses; a fully populated sheet must use the warmed cache.
        const uncached_requests = []
        await page.route( CHAT_URL, route => uncached_requests.push( route.request().postDataJSON() ) )
        await sentence.locator( `[data-translation-word]` ).first().tap()
        await expect( page.locator( `[data-reader-word-tooltip]` ) ).toHaveText( `Source one` )
        const sheet = page.locator( `[data-translation-info-sheet]` )
        await expect( sheet ).toBeVisible()
        await expect( sheet.locator( `[data-word-by-word-translation]` ) ).toHaveAttribute( `aria-busy`, `false` )
        await expect( sheet ).toContainText( `Source eight` )
        expect( calls.words.filter( call => call.context === context ) ).toHaveLength( before_tap )
        expect( uncached_requests.filter( body => body.messages.some( message =>
            message.role === `user` && message.content.includes( `Sentence: "${ context }"` )
        ) ) ).toHaveLength( 0 )
    } )

    test( `keeps a tapped pending lookup alive when Turbo Mode stops for a hidden page`, async ( { page } ) => {
        const calls = await install_mock( page, { hold_words: true } )
        await enable_saved_turbo( page )
        await open_seeded_reader( page )
        await expect.poll( () => calls.words.length ).toBe( 2 )

        const selected_request = calls.words[0]
        const cancelled_requests = []
        page.on( `requestfailed`, request => cancelled_requests.push( request ) )
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.locator( `[data-translation-word]` ).first().tap()
        const sheet = page.locator( `[data-translation-info-sheet]` )
        await expect( sheet ).toBeVisible()
        await expect( sheet.locator( `[data-word-by-word-translation]` ) ).toHaveAttribute( `aria-busy`, `true` )
        await expect.poll( () => calls.words.length ).toBe( 3 )

        // Headless Chromium has no real tab-hiding action. Dispatch the browser
        // visibility signal while preserving the user's selected foreground word.
        await page.evaluate( () => {
            Object.defineProperty( document, `hidden`, { configurable: true, value: true } )
            document.dispatchEvent( new Event( `visibilitychange` ) )
        } )

        calls.hold_words = false
        await Promise.all( calls.words.map( ( { word, route } ) => route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { choices: [ { message: { content: `Source ${ word.toLowerCase() }` } } ] } )
        } ) ) )

        await expect( page.locator( `[data-reader-word-tooltip]` ) ).toHaveText( `Source one` )
        await expect( sheet.locator( `[data-word-by-word-translation]` ) ).toHaveAttribute( `aria-busy`, `false` )
        await expect( sheet ).toContainText( `Source eight` )
        expect( cancelled_requests ).not.toContain( selected_request.route.request() )
        expect( calls.words.filter( call =>
            call.context === selected_request.context && call.word.toLowerCase() === selected_request.word.toLowerCase()
        ) ).toHaveLength( 1 )
    } )

    for( const stop_action of [ `disable`, `offline`, `leave reader` ] ) {
        test( `limits background concurrency and cancels when users ${ stop_action }`, async ( { page, context } ) => {
            const calls = await install_mock( page, { hold_words: true } )
            await enable_saved_turbo( page )
            await open_seeded_reader( page )
            await expect.poll( () => calls.words.length ).toBe( 2 )
            await settle_scans( page )
            expect( calls.words ).toHaveLength( 2 )

            const cancelled = []
            page.on( `requestfailed`, request => {
                if( calls.words.some( call => call.route.request() === request ) ) cancelled.push( request )
            } )

            if( stop_action === `disable` ) {
                await page.getByRole( `button`, { name: `Settings` } ).click()
                await page.getByRole( `switch`, { name: `Turbo Mode` } ).click()
                await page.getByRole( `button`, { name: `Close`, exact: true } ).click()
            } else if( stop_action === `offline` ) {
                await context.setOffline( true )
                await expect( page.getByText( `Offline — showing cached translations` ) ).toBeVisible()
            } else {
                await page.getByRole( `button`, { name: `Back to library` } ).click()
                await expect( page ).toHaveURL( /\/library$/ )
            }

            await expect.poll( () => cancelled.length ).toBe( 2 )
            await page.clock.runFor( 1_000 )
            expect( calls.words ).toHaveLength( 2 )
        } )
    }

} )
