import JSZip from 'jszip'
import { test, expect, open_seeded_reader, SEEDED_BOOK_ID } from './helpers/app_fixture.js'
import { CHAT_URL, parse_chat_request, fulfil_chat, answer_request } from './helpers/openrouter_mock.js'
const chapters = [ 12, 48, 48 ].map( ( count, chapter ) => Array.from( { length: count }, ( _, sentence ) =>
    Array.from( { length: 12 }, ( _, word ) => `word${ chapter }x${ sentence }x${ word }` ).join( ` ` ) + `.`
) )

// Use an actual EPUB so chapter parsing, lazy loading, layout, and navigation all run.
const seed_epub = async ( page, content = chapters, turbo = false ) => {
    const zip = new JSZip()
    zip.file( `mimetype`, `application/epub+zip` )
    zip.file( `META-INF/container.xml`, `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>` )
    zip.file( `book.opf`, `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">window-fixture</dc:identifier><dc:title>Reading window</dc:title><dc:language>en</dc:language></metadata><manifest>${ content.map( ( _, index ) => `<item id="chapter${ index }" href="chapter${ index }.xhtml" media-type="application/xhtml+xml"/>` ).join( `` ) }</manifest><spine>${ content.map( ( _, index ) => `<itemref idref="chapter${ index }"/>` ).join( `` ) }</spine></package>` )
    content.forEach( ( sentences, index ) => zip.file( `chapter${ index }.xhtml`, `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${ index }</title></head><body>${ sentences.map( sentence => `<p>${ sentence }</p>` ).join( `` ) }</body></html>` ) )
    const bytes = await zip.generateAsync( { type: `uint8array` } )
    await page.evaluate( async ( { bytes, book_id, turbo } ) => {
        const { get_book, save_book } = await import( `/src/modules/cache.js` )
        const book = await get_book( book_id )
        await save_book( { ...book, file: new Blob( [ new Uint8Array( bytes ) ], { type: `application/epub+zip` } ) } )
        const saved = JSON.parse( localStorage.getItem( `settings-storage` ) )
        saved.state.turbo_mode = turbo
        localStorage.setItem( `settings-storage`, JSON.stringify( saved ) )
    }, { bytes: Array.from( bytes ), book_id: SEEDED_BOOK_ID, turbo } )
}

const mock_translations = async ( page, hold = false ) => {
    const calls = { sentences: [], words: [], held: [], hold }
    await page.route( CHAT_URL, async route => {
        const request = parse_chat_request( route.request().postDataJSON() )

        // Flatten batches: assertions track requested words and sentences, not HTTP calls
        request.words.forEach( word => calls.words.push( { context: request.sentence, word } ) )
        calls.sentences.push( ...request.sentences )
        const fulfill = () => fulfil_chat( route, answer_request( request, { sentence: text => text, word: text => `Source ${ text }` } ) )
        if( calls.hold ) calls.held.push( fulfill )
        else await fulfill()
    } )
    return calls
}

// Measure the words a reader can see, accounting for fixed controls covering text.
const visible_words = page => page.locator( `[data-reading-word]` ).evaluateAll( elements => {
    const top = document.querySelector( `header` ).getBoundingClientRect().bottom
    const bottom = document.querySelector( `[data-reader-dock]` ).getBoundingClientRect().top
    return elements.filter( element => [ ...element.getClientRects() ].some( rect =>
        rect.height > 0 && rect.bottom > top && rect.top < bottom && rect.right > 0 && rect.left < innerWidth
    ) ).map( element => element.textContent )
} )

const expected_sentences = async page => {
    const visible = await visible_words( page )
    expect( visible.length ).toBeGreaterThan( 0 )
    const words = chapters.flat().flatMap( sentence => sentence.replace( /\.$/, `` ).split( ` ` ) )
    const first = words.indexOf( visible[0] )
    const last = words.indexOf( visible.at( -1 ) ) + visible.length * 2
    return chapters.flat().filter( sentence => sentence.replace( /\.$/, `` ).split( ` ` ).some( word => {
        const index = words.indexOf( word )
        return index >= first && index <= last
    } ) )
}

// Resize notifications arrive on a real rendering step that the fake clock does not drive.
// A fresh observer's first callback lands in that same step, after the window's resize event,
// so the reader has seen the new viewport before the clock runs its scan timer.
const after_layout = page => page.evaluate( () => new Promise( resolve => {
    const observer = new ResizeObserver( () => {
        observer.disconnect()
        resolve()
    } )
    observer.observe( document.documentElement )
} ) )

// Advance fake time in small steps: React commits on real-time tasks between them, so a
// timer scheduled by a commit (scan → window update → translation queue) still fires.
const run_clock = async ( page, ms ) => {
    for( let elapsed = 0; elapsed < ms; elapsed += 50 ) await page.clock.runFor( 50 )
}

const settle = async page => {
    await expect( page.getByText( /^Translating · \d+\/\d+$/ ) ).not.toBeVisible()
    await page.clock.runFor( 600 )
    await expect( page.getByText( /^Translating · \d+\/\d+$/ ) ).not.toBeVisible()
}

test.describe( `Viewport translation budget`, () => {
    test.use( { app_state: `reader`, viewport: { width: 900, height: 900 } } )
    test.beforeEach( async ( { page } ) => page.clock.install() )

    test( `translates visible words plus twice their count across chapter boundaries`, async ( { page } ) => {
        await seed_epub( page )
        const calls = await mock_translations( page )
        await open_seeded_reader( page )
        await expect( page.locator( `[data-translation-word]` ).first() ).toBeVisible()
        await settle( page )
        const expected = await expected_sentences( page )
        await expect.poll( () => calls.sentences.length ).toBe( expected.length )
        expect( expected.some( sentence => chapters[1].includes( sentence ) ) ).toBe( true )
        expect( new Set( calls.sentences ) ).toEqual( new Set( expected ) )
        expect( calls.words ).toHaveLength( 0 )

        // Growing the viewport increases admission; existing cache hits consume budget.
        await page.setViewportSize( { width: 900, height: 1200 } )
        await expect.poll( async () => calls.sentences.length ).toBeGreaterThan( expected.length )
        await settle( page )
        const expanded = new Set( [ ...expected, ...await expected_sentences( page ) ] )
        await expect.poll( () => calls.sentences.length ).toBe( expanded.size )
        expect( new Set( calls.sentences ) ).toEqual( expanded )
    } )

    test( `fills the word budget across more than two short chapters`, async ( { page } ) => {
        const short_chapters = [ chapters[0].slice( 0, 3 ), ...chapters[1].map( sentence => [ sentence ] ) ]
        await seed_epub( page, short_chapters )
        const calls = await mock_translations( page )
        await open_seeded_reader( page )
        await expect( page.locator( `[data-translation-word]` ).first() ).toBeVisible()
        await expect.poll( () => calls.sentences.length ).toBe( 9 )
        await settle( page )
        expect( await visible_words( page ) ).toHaveLength( 36 )
        expect( new Set( calls.sentences ) ).toEqual( new Set( short_chapters.flat().slice( 0, 9 ) ) )
    } )

    test( `warms exactly three viewport word counts, even within one sentence`, async ( { page } ) => {
        await page.setViewportSize( { width: 390, height: 500 } )
        const words = Array.from( { length: 800 }, ( _, index ) => `token${ index }` )
        const sentence = `${ words.join( ` ` ) }.`
        await seed_epub( page, [ [ sentence ] ], true )
        const calls = await mock_translations( page )
        await open_seeded_reader( page )
        await expect( page.locator( `[data-translation-word]` ).first() ).toBeVisible()
        const visible = await visible_words( page )
        expect( visible.length ).toBeGreaterThan( 0 )
        const expected = [ ...visible, ...words.slice( words.indexOf( visible.at( -1 ) ) + 1, words.indexOf( visible.at( -1 ) ) + 1 + visible.length * 2 ) ]
        await expect.poll( () => calls.words.length, { timeout: 15_000 } ).toBe( expected.length )
        await settle( page )
        expect( calls.words.map( call => call.word ) ).toEqual( expected )
        expect( calls.words.every( call => call.context === sentence ) ).toBe( true )
    } )

    test( `counts repeated and cached words without warming the end of a long sentence`, async ( { page } ) => {
        const sentence = `${ Array( 800 ).fill( `one two` ).join( ` ` ) } forbidden.`
        await seed_epub( page, [ [ sentence ] ], true )
        const calls = await mock_translations( page )
        await open_seeded_reader( page )
        await expect.poll( () => calls.words.length ).toBe( 2 )
        await settle( page )
        expect( calls.words.map( call => call.word.toLowerCase() ).sort() ).toEqual( [ `one`, `two` ] )
        expect( calls.words.every( call => call.context === sentence ) ).toBe( true )
        expect( calls.sentences ).toEqual( [ sentence ] )

        await page.reload()
        await expect( page.locator( `[data-translation-word]` ).first() ).toBeVisible()
        await settle( page )
        expect( calls.words ).toHaveLength( 2 )
        expect( calls.sentences ).toHaveLength( 1 )

        // Reader scroll makes the previously excluded tail eligible.
        await page.locator( `[data-translation-word]` ).last().scrollIntoViewIfNeeded()
        await expect.poll( () => calls.words.map( call => call.word.toLowerCase() ) ).toContain( `forbidden` )
    } )

    test( `never warms the previous language context after a language switch`, async ( { page } ) => {
        await seed_epub( page, [ [ chapters[0][0] ] ], true )
        const spanish = `hola mundo amigo lector.`
        const french = `bonjour monde ami lecteur.`
        const lookups = []
        const held_french = []
        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            const is_french = request.system.includes( `French` )
            const is_word = request.words.length > 0
            const answer = answer_request( request, { sentence: () => is_french ? french : spanish, word: text => `Source ${ text }` } )
            const fulfill = () => fulfil_chat( route, answer )
            if( is_word ) {
                // One entry per word, so batched glosses count like single lookups
                request.words.forEach( () => lookups.push( { french: is_french, context: request.sentence } ) )
                if( !is_french ) return
            } else if( is_french ) {
                held_french.push( fulfill )
                return
            }
            await fulfill()
        } )
        await open_seeded_reader( page )
        // All four words of the one Spanish sentence now share a single held batch request
        await expect.poll( () => lookups.length ).toBe( 4 )

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByPlaceholder( `Search languages...` ).fill( `French` )
        await page.keyboard.press( `Enter` )
        await page.keyboard.press( `Escape` )
        await expect.poll( () => held_french.length ).toBeGreaterThan( 0 )
        await page.clock.runFor( 600 )
        expect( lookups.filter( lookup => lookup.french ) ).toHaveLength( 0 )

        // The new language cannot reuse old translated words while its sentence is pending.
        await Promise.all( held_french.map( fulfill => fulfill() ) )
        await expect.poll( () => lookups.filter( lookup => lookup.french ).length ).toBe( 4 )
        await settle( page )
        expect( lookups.filter( lookup => lookup.french ).every( lookup => lookup.context === french ) ).toBe( true )
    } )

    test( `resumes a skipped cache miss when its window returns during another request`, async ( { page } ) => {
        const calls = await mock_translations( page, true )
        await page.addInitScript( () => {
            const original_get = IDBObjectStore.prototype.get
            const success = Object.getOwnPropertyDescriptor( IDBRequest.prototype, `onsuccess` )
            // Delay one real cache response to reproduce navigation during IndexedDB I/O.
            IDBObjectStore.prototype.get = function( ...args ) {
                const request = original_get.apply( this, args )
                if( this.name !== `translations` || window.translation_cache_delayed ) return request
                window.translation_cache_delayed = true
                Object.defineProperty( request, `onsuccess`, {
                    set( callback ) {
                        success.set.call( request, event => {
                            window.release_translation_cache_read = () => callback.call( request, event )
                        } )
                    }
                } )
                return request
            }
        } )
        // Share Vite's React instance with the production hook and renderer.
        const hook_source = await ( await page.request.get( `/src/hooks/use_translation.js` ) ).text()
        const [ , react_url ] = hook_source.match( /"([^" ]*\/react\.js\?[^" ]*)"/ )
        const renderer_url = react_url.replace( `react.js`, `react-dom_client.js` )
        // Isolate admission from layout observers: no incidental resize may rescue the queue.
        await page.route( `**/__playwright/translation-race`, route => route.fulfill( {
            contentType: `text/html`,
            body: `<!doctype html><div id="root"></div><script type="module">
                import React from '${ react_url }'
                const { useState } = React
                import ReactDOM from '${ renderer_url }'
                const { createRoot } = ReactDOM
                import { use_translation } from '/src/hooks/use_translation.js'
                const sentences = [
                    { id: 'first', text: 'First sentence to translate.' },
                    { id: 'second', text: 'Second sentence to translate.' }
                ]
                function Reader() {
                    const [ ids, set_ids ] = useState( [ 'first' ] )
                    const { translations } = use_translation( {
                        all_sentences: sentences, eligible_sentence_ids: ids,
                        target_language: 'Spanish', source_language: 'en', level: 'a2',
                        book_id: 'window-race', is_online: true
                    } )
                    return React.createElement( 'main', null,
                        React.createElement( 'button', { onClick: () => set_ids( [ 'first' ] ) }, 'First window' ),
                        React.createElement( 'button', { onClick: () => set_ids( [ 'second' ] ) }, 'Second window' ),
                        React.createElement( 'output', { 'data-current-window': true }, ids[0] ),
                        React.createElement( 'p', { 'data-first-translation': true }, translations.first || 'Pending' )
                    )
                }
                createRoot( document.getElementById( 'root' ) ).render( React.createElement( Reader ) )
            </script>`
        } ) )
        await page.goto( `/__playwright/translation-race` )
        await expect.poll( () => page.evaluate( () => typeof window.release_translation_cache_read ) ).toBe( `function` )
        await page.getByRole( `button`, { name: `Second window` } ).click()
        await expect( page.locator( `[data-current-window]` ) ).toHaveText( `second` )
        await page.clock.runFor( 600 )
        await page.evaluate( () => window.release_translation_cache_read() )
        await expect.poll( () => calls.sentences ).toEqual( [ `Second sentence to translate.` ] )

        await page.getByRole( `button`, { name: `First window` } ).click()
        await expect( page.locator( `[data-current-window]` ) ).toHaveText( `first` )
        await page.clock.runFor( 600 )
        calls.hold = false
        await Promise.all( calls.held.splice( 0 ).map( fulfill => fulfill() ) )
        await expect( page.locator( `[data-first-translation]` ) ).toHaveText( `First sentence to translate.` )
        expect( calls.sentences ).toEqual( [ `Second sentence to translate.`, `First sentence to translate.` ] )
    } )

    test( `keeps eligible requests alive while a smaller viewport drops queued read-ahead`, async ( { page } ) => {
        await seed_epub( page )
        const calls = await mock_translations( page, true )
        const failed_requests = []
        page.on( `requestfailed`, request => {
            if( request.url().includes( `/chat/completions` ) ) failed_requests.push( request )
        } )
        await open_seeded_reader( page )
        await expect.poll( () => calls.sentences.length ).toBeGreaterThan( 0 )
        await page.clock.runFor( 600 )
        const initial = [ ...calls.sentences ]
        const original_window = await expected_sentences( page )

        await page.setViewportSize( { width: 900, height: 500 } )
        await after_layout( page )
        await run_clock( page, 600 )
        const smaller_window = await expected_sentences( page )
        expect( original_window.length ).toBeGreaterThan( smaller_window.length )
        expect( initial.every( sentence => smaller_window.includes( sentence ) ) ).toBe( true )
        expect( calls.sentences ).toEqual( initial )
        expect( failed_requests ).toHaveLength( 0 )

        // Completing the original requests must drain only the newly admitted queue.
        calls.hold = false
        await Promise.all( calls.held.map( fulfill => fulfill() ) )
        await expect.poll( () => calls.sentences.length ).toBe( smaller_window.length )
        await settle( page )
        expect( new Set( calls.sentences ) ).toEqual( new Set( smaller_window ) )
        expect( calls.sentences.length ).toBe( new Set( calls.sentences ).size )
        expect( failed_requests ).toHaveLength( 0 )
    } )

    test( `abandons queued old sentences after changing chapter while requests are pending`, async ( { page } ) => {
        await seed_epub( page )
        const calls = await mock_translations( page, true )
        await open_seeded_reader( page )
        await expect.poll( () => calls.sentences.length ).toBeGreaterThan( 0 )
        const initial = [ ...calls.sentences ]
        await page.keyboard.press( `ArrowRight` )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( `word1x0x0` )
        calls.hold = false
        await Promise.all( calls.held.map( fulfill => fulfill() ) )
        await expect.poll( () => calls.sentences.some( sentence => chapters[1].includes( sentence ) ) ).toBe( true )
        await settle( page )
        expect( calls.sentences.filter( sentence => chapters[0].includes( sentence ) ) ).toEqual( initial.filter( sentence => chapters[0].includes( sentence ) ) )
    } )

    test( `keeps live, retried and queued translations under one shared request ceiling`, async ( { page } ) => {
        // One sentence per paragraph: every request is a single, so counts map to requests
        const sentences = Array.from( { length: 40 }, ( _, index ) => `Sentence number ${ index } carries a handful of short words.` )
        await seed_epub( page, [ sentences ] )
        const failed_sentences = []
        const held = []
        const retried = []
        let release_all = false
        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            const answer = () => fulfil_chat( route, answer_request( request, { sentence: text => text } ) )
            if( request.kind !== `sentence` ) return answer()
            // The first five requests fail and schedule retries
            if( failed_sentences.length < 5 && !failed_sentences.includes( request.sentence ) ) {
                failed_sentences.push( request.sentence )
                return route.fulfill( { status: 500, body: `{}` } )
            }
            if( failed_sentences.includes( request.sentence ) ) retried.push( request.sentence )
            if( release_all ) return answer()
            held.push( answer )
        } )
        await open_seeded_reader( page )

        // The live window fills every slot after the failures
        await expect.poll( () => held.length ).toBe( 5 )

        // Retries come due while those five are still open (the retry check runs every
        // 5s and the first backoff is 5s, so the 10s check picks them up): they must wait
        await run_clock( page, 11_000 )
        expect( held.length ).toBe( 5 )
        expect( retried ).toHaveLength( 0 )

        // Freed slots go to the waiting work, retries included
        release_all = true
        await Promise.all( held.splice( 0 ).map( answer => answer() ) )
        await run_clock( page, 1_000 )
        await expect.poll( async () => {
            await page.clock.runFor( 500 )
            return new Set( retried ).size
        } ).toBe( 5 )
    } )

} )
