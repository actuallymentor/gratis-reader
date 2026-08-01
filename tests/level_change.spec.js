import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, clear_storage } from './helpers/setup.js'

const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`

const system_prompt_from = request => {
    const body = request.postDataJSON()
    return body.messages?.find( message => message.role === `system` )?.content || ``
}

test.describe( `Level & Language Changes`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await mock_openrouter( page )
        await upload_demo_book( page )
    } )

    const enter_reader = async ( page ) => {
        await open_reader( page )
    }

    test( `changing proficiency level re-translates visible sentences`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for initial translations
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Track API calls after level change
        let api_calls_after_change = 0
        await page.route( CHAT_URL, async route => {
            const request = route.request()
            const system_prompt = system_prompt_from( request )

            // Read-ahead requests from the original level may still be in flight.
            // Leave those with the base mock so only an Adult request can satisfy
            // this test's retranslation signal.
            if( !system_prompt.includes( `at the Adult level` ) ) {
                await route.fallback()
                return
            }

            api_calls_after_change++
            const body = request.postDataJSON()
            const msg = body.messages?.find( m => m.role === `user` )?.content || ``
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[LEVEL-CHANGED] ${ msg.slice( 0, 30 ) }` } } ]
                } )
            } )
        } )

        // Open settings and change level
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.locator( `aside` ).filter( { hasText: `Target Language` } ) ).toBeVisible()

        // Find and click a different level (pick the last level option)
        const adult_level = page.getByRole( `button`, { name: /C1-C2 Adult/i } )
        await expect( adult_level ).toBeVisible()
        const changed_translation = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            system_prompt_from( request ).includes( `at the Adult level` )
        )
        await adult_level.click()
        await changed_translation

        // Close settings
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( /\[LEVEL-CHANGED\]/ ).first() ).toBeVisible()

        // Should have made new API calls with the changed level
        expect( api_calls_after_change ).toBeGreaterThan( 0 )

    } )

    test( `changing target language clears and re-translates`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for initial translations
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Track calls after language change
        let new_calls = 0
        await page.route( CHAT_URL, async route => {
            const system_prompt = system_prompt_from( route.request() )

            // Ignore any Spanish read-ahead still draining from the initial render.
            if( !system_prompt.includes( `helping a student learn French` ) ) {
                await route.fallback()
                return
            }

            new_calls++
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[LANG-CHANGED]` } } ]
                } )
            } )
        } )

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.locator( `aside` ).filter( { hasText: `Target Language` } ) ).toBeVisible()

        // Change target language — find the language input/select and change it
        const lang_input = page.locator( `input[placeholder*="language" i], input[list]` ).first()
        await expect( lang_input ).toBeVisible()

        const changed_translation = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            system_prompt_from( request ).includes( `helping a student learn French` )
        )
        await lang_input.fill( `French` )
        await page.keyboard.press( `Enter` )
        await changed_translation

        // Close settings
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( /\[LANG-CHANGED\]/ ).first() ).toBeVisible()

        // New API calls should have been made
        expect( new_calls ).toBeGreaterThan( 0 )

    } )

} )
