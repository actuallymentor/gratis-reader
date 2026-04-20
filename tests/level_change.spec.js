import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, mock_openrouter, clear_storage } from './helpers/setup.js'

test.describe( `Level & Language Changes`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await mock_openrouter( page )
        await upload_demo_book( page )
    } )

    const enter_reader = async ( page ) => {

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

    }

    test( `changing proficiency level re-translates visible sentences`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for initial translations
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Track API calls after level change
        let api_calls_after_change = 0
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            api_calls_after_change++
            const body = JSON.parse( route.request().postData() )
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
        await page.waitForTimeout( 300 )

        // Find and click a different level (pick the last level option)
        const level_buttons = page.locator( `button` ).filter( { hasText: /adult|c1|c2/i } )
        await level_buttons.first().click()
        await page.waitForTimeout( 300 )

        // Close settings
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 5000 )

        // Should have made new API calls with the changed level
        expect( api_calls_after_change ).toBeGreaterThan( 0 )

    } )

    test( `changing target language clears and re-translates`, async ( { page } ) => {

        await enter_reader( page )

        // Wait for initial translations
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Track calls after language change
        let new_calls = 0
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
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
        await page.waitForTimeout( 300 )

        // Change target language — find the language input/select and change it
        const lang_input = page.locator( `input[placeholder*="language" i], input[list]` ).first()
        if( await lang_input.isVisible().catch( () => false ) ) {
            await lang_input.fill( `French` )
            // Select from datalist if visible
            await page.waitForTimeout( 300 )
            await page.keyboard.press( `Enter` )
        }

        // Close settings
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 5000 )

        // New API calls should have been made
        expect( new_calls ).toBeGreaterThan( 0 )

    } )

} )
