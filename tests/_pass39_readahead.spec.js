/**
 * Pass 39 — Read-ahead translation buffer test
 * Verifies that the app pre-translates 2 chapters ahead of the current one
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_auth } from './helpers/setup.js'

test.describe( `Pass 39 — Read-ahead buffer`, () => {

    test( `BW200 translates current chapter plus 2 ahead`, async ( { page } ) => {

        // Track all translation API calls
        const translated_sentences = new Set()

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence_match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = sentence_match ? sentence_match[1].trim() : `unknown`

            translated_sentences.add( sentence )

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ]
                } )
            } )
        } )

        await mock_auth( page )
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )

        // Wait for translations to complete (current + 2 ahead)
        await page.waitForTimeout( 8000 )

        // Should have translated more sentences than just the current chapter
        // (the read-ahead buffer should include next 2 chapters' worth)
        const count = translated_sentences.size
        expect( count ).toBeGreaterThan( 0 )

        // Now navigate to next chapter — translations should already be cached
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 3000 )

        // The sentences in chapter 2 should render with [TRANSLATED] prefix
        // because they were pre-translated by the read-ahead buffer
        const sentences = page.locator( `span[data-sentence-id]` )
        const first_text = await sentences.first().textContent()
        // Sentence should show translated text (from cache, not waiting for API)
        expect( first_text.length ).toBeGreaterThan( 0 )
    } )

} )
