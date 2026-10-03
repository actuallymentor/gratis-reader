import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'
import { CHAT_URL, parse_chat_request, fulfil_chat, answer_request } from './helpers/openrouter_mock.js'
import { language_combobox } from './helpers/reader.js'

const system_prompt_from = request => {
    const body = request.postDataJSON()
    return body.messages?.find( message => message.role === `system` )?.content || ``
}

test.describe( `Level & Language Changes`, () => {

    test.use( { app_state: `reader` } )

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
    } )

    test( `changing proficiency level re-translates visible sentences`, async ( { page } ) => {

        await open_seeded_reader( page )

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
            const parsed = parse_chat_request( request.postDataJSON() )
            await fulfil_chat( route, answer_request( parsed, { sentence: text => `[LEVEL-CHANGED] ${ text.slice( 0, 30 ) }` } ) )
        } )

        // Open settings and change level
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `dialog`, { name: `Settings` } ).filter( { hasText: `Target Language` } ) ).toBeVisible()

        // Find and click a different level (pick the last level option)
        const adult_level = page.getByRole( `radio`, { name: /C1-C2\s*Adult/i } )
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

        await open_seeded_reader( page )

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
            const request = parse_chat_request( route.request().postDataJSON() )
            await fulfil_chat( route, answer_request( request, { sentence: () => `[LANG-CHANGED]` } ) )
        } )

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `dialog`, { name: `Settings` } ).filter( { hasText: `Target Language` } ) ).toBeVisible()

        // Opening the picker lists common languages first and offers search
        const lang_input = language_combobox( page )
        await lang_input.click()
        await expect( lang_input ).toHaveAttribute( `placeholder`, `Search languages...` )
        const option_texts = await page.getByRole( `option` ).allTextContents()
        const common = [ `Spanish`, `French`, `German`, `Italian`, `Portuguese` ]
            .filter( language => option_texts.slice( 0, 10 ).some( text => text.includes( language ) ) )
        expect( common.length ).toBeGreaterThanOrEqual( 3 )

        await lang_input.fill( `Japan` )
        await expect( page.getByRole( `option`, { name: `Japanese`, exact: true } ) ).toBeVisible()

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

        // The choice is persisted for the next session
        await expect.poll( () => page.evaluate( () =>
            JSON.parse( localStorage.getItem( `settings-storage` ) ).state.last_language
        ) ).toBe( `French` )

    } )

} )
