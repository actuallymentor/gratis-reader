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

    // Handle language modal if shown
    const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
    try {
        await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
        await start_btn.click()
    } catch { /* modal not shown — returning reader */ }

    // Wait for content to load
    await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

}

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

        let content
        if( is_explanation ) {
            content = `[EXPLANATION] This sentence means something interesting. The original uses formal language that was simplified for the target level.`
        } else if( is_word_lookup ) {
            content = `[WORD] definition of the word`
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
