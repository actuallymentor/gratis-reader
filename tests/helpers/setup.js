import { expect } from '@playwright/test'

/**
 * Injects API key into localStorage so the app thinks we're authenticated.
 * Must be called BEFORE navigating to a page that checks auth.
 */
export const setup_api_key = async ( page ) => {

    const api_key = process.env.VITE_OPENROUTER_API_KEY || `sk-or-test-fake-key`

    await page.goto( `/` )
    await page.evaluate( ( key ) => {
        const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
        store.state = { ...( store.state || {} ), api_key: key }
        localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
    }, api_key )

}

/**
 * Uploads the demo book and waits for it to appear in the library.
 * Assumes API key is already set.
 */
export const upload_demo_book = async ( page ) => {

    await page.goto( `/library` )

    // Check if book already exists
    const existing = page.getByRole( `heading`, { name: `Smart work beats hard work` } )
    if( await existing.isVisible().catch( () => false ) ) return

    // Upload via the hidden file input
    const file_input = page.locator( `input[type="file"]` )
    await file_input.setInputFiles( `./tests/fixtures/book.epub` )

    // Wait for the book card to appear (use heading role to avoid matching toast)
    await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

}

/**
 * Navigate into the reader for the demo book.
 * Handles the language selection modal if it appears.
 */
export const open_reader = async ( page ) => {

    // Click the book cover to open it
    await page.locator( `img[alt]` ).first().click()
    await page.waitForURL( /\/read\// )

    // ReaderPage resolves first-open state from IndexedDB asynchronously. Query
    // the same persisted state before choosing which UI to await; sentence text
    // can render briefly before the first-open modal decision completes.
    const book_id = new URL( page.url() ).pathname.split( `/` ).pop()
    const has_saved_progress = await page.evaluate( async id => {
        const { get_progress } = await import( `/src/modules/cache.js` )
        const progress = await get_progress( id )
        return progress?.chapter_index !== undefined
    }, book_id )

    const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
    const first_sentence = page.locator( `span[data-sentence-id]` ).first()

    if( !has_saved_progress ) {
        await expect( start_btn ).toBeVisible( { timeout: 10_000 } )
        await start_btn.click()
    }

    // Wait for content to load
    await expect( first_sentence ).toBeVisible( { timeout: 10_000 } )

}

/**
 * Returns the persisted translation records for sentences in the visible chapter.
 * Exact cache keys avoid confusing repeated sentence text in read-ahead chapters.
 */
export const get_current_translation_entries = page => page.evaluate( async () => {
    const sentence_ids = [ ...document.querySelectorAll( `span[data-sentence-id]` ) ]
        .map( sentence => sentence.dataset.sentenceId )
    const database = await new Promise( ( resolve, reject ) => {
        const request = indexedDB.open( `gratis_reader` )
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )
    const entries = await new Promise( ( resolve, reject ) => {
        const transaction = database.transaction( `translations`, `readonly` )
        const request = transaction.objectStore( `translations` ).getAll()
        request.onsuccess = () => resolve( request.result )
        request.onerror = () => reject( request.error )
    } )

    return entries
        .filter( entry => sentence_ids.some( id => entry.key.startsWith( `${ id }:` ) ) )
        .sort( ( first, second ) => first.key.localeCompare( second.key ) )
} )

/**
 * Mock the OpenRouter API to return deterministic translations.
 */
export const mock_openrouter = async ( page ) => {

    await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {

        const body = JSON.parse( route.request().postData() )
        const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``

        // Detect request type by distinctive markers in the user message
        const is_explanation = user_msg.includes( `Explain this translation` )
        const is_word_lookup = user_msg.includes( `Word:` )
        const is_sentence_meaning = user_msg.includes( `Adapted translation:` )

        let content
        if( is_explanation ) {
            content = `[EXPLANATION] This sentence means something interesting. The original uses formal language that was simplified for the target level.`
        } else if( is_word_lookup ) {
            content = `[WORD] definition of the word`
        } else if( is_sentence_meaning ) {
            const sentence_match = user_msg.match( /Adapted translation:\n(.+?)(?:\n\n|$)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`
            content = `[MEANING] ${ sentence }`
        } else {
            // Translation — extract the sentence from prompt
            const sentence_match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`
            content = `[TRANSLATED] ${ sentence }`
        }

        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( {
                choices: [ { message: { content } } ],
                usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
            } )
        } )

    } )

}

/**
 * Mock the OpenRouter API key validation endpoint.
 */
export const mock_auth = async ( page ) => {

    await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { data: { label: `test-key` } } )
        } )
    } )

}

/**
 * Clear all app storage (localStorage + IndexedDB).
 */
export const clear_storage = async ( page ) => {

    await page.goto( `/` )
    await page.evaluate( () => {
        localStorage.clear()
        // Delete IndexedDB
        return new Promise( ( resolve ) => {
            const req = indexedDB.deleteDatabase( `gratis_reader` )
            req.onsuccess = resolve
            req.onerror = resolve
            req.onblocked = resolve
        } )
    } )

}
