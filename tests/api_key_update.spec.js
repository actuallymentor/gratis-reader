import { test, expect } from './helpers/app_fixture.js'
import { mock_auth } from './helpers/setup.js'

const AUTH_URL = `**/openrouter.ai/api/v1/auth/key`
const SEEDED_KEY = `sk-or-test-fake-key`

// The 1857-book Gutenberg catalogue keeps /library's main thread busy for seconds
// (clicks wait on "stable"); settings never read it, so serve an empty one
const skip_gutenberg_catalogue = page => page.route( `**/gutenberg.json`, route => route.fulfill( { json: [] } ) )

test.describe( `API Key Management`, () => {

    test.use( { app_state: `authenticated` } )

    test.beforeEach( async ( { page } ) => {
        await mock_auth( page )
        await skip_gutenberg_catalogue( page )
    } )

    const open_settings = async page => {
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `dialog`, { name: `Settings` } ) ).toBeVisible()
    }

    const key_input = page => page.locator( `input[placeholder="sk-or-..."]` )

    test( `shows the key masked and never puts the full key in the DOM`, async ( { page } ) => {

        await page.goto( `/library` )
        await expect( page.getByRole( `button`, { name: `Settings` } ) ).toBeVisible()
        expect( await page.content() ).not.toContain( SEEDED_KEY )

        await page.getByRole( `button`, { name: `Settings` } ).click()

        // First 6 + last 4 characters, e.g. "sk-or-...-key"
        const code = page.locator( `code` ).first()
        await expect( code ).toHaveText( `${ SEEDED_KEY.slice( 0, 6 ) }...${ SEEDED_KEY.slice( -4 ) }` )

        // Markup and attributes, not just visible text
        expect( await page.content() ).not.toContain( SEEDED_KEY )

    } )

    test( `update reveals an input; whitespace cannot be saved; cancel restores the masked key`, async ( { page } ) => {

        await open_settings( page )
        await page.getByRole( `button`, { name: `Update Key` } ).click()

        const input = key_input( page )
        await expect( input ).toBeVisible()

        // Whitespace is not submittable: Save stays disabled
        await input.fill( `   ` )
        await expect( page.getByRole( `button`, { name: `Save` } ) ).toBeDisabled()

        await page.getByRole( `button`, { name: `Cancel`, exact: true } ).click()
        await expect( input ).not.toBeVisible()
        await expect( page.locator( `code` ).first() ).toBeVisible()

    } )

    test( `saving a valid key confirms, updates the masked display and survives a reload`, async ( { page } ) => {

        await open_settings( page )

        await page.getByRole( `button`, { name: `Update Key` } ).click()
        await key_input( page ).fill( `sk-or-persistent-new-WXYZ` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        await expect( page.getByText( `API key updated` ) ).toBeVisible( { timeout: 5000 } )
        await expect( page.locator( `code` ).first() ).toContainText( `WXYZ` )

        // Hydrated from storage on a fresh load
        await page.reload()
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.locator( `code` ).first() ).toContainText( `WXYZ` )

    } )

    test( `rejects invalid API key with an inline error`, async ( { page } ) => {

        await page.route( AUTH_URL, route => route.fulfill( { status: 401, body: `Unauthorized` } ) )
        await open_settings( page )

        await page.getByRole( `button`, { name: `Update Key` } ).click()
        await key_input( page ).fill( `sk-or-bad-key` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        await expect( page.getByText( /invalid api key/i ) ).toBeVisible( { timeout: 3000 } )

        // Still editing, so the user can fix the key
        await expect( key_input( page ) ).toBeVisible()

    } )

    test( `network failure shows a dialog, not "invalid key", and keeps the edit`, async ( { page } ) => {

        await open_settings( page )
        await page.getByRole( `button`, { name: `Update Key` } ).click()

        await page.route( AUTH_URL, route => route.abort( `connectionrefused` ) )
        await key_input( page ).fill( `sk-or-new-key-123` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        const failure = page.getByRole( `dialog`, { name: `Couldn't save the API key` } )
        await expect( failure ).toBeVisible( { timeout: 5000 } )
        await expect( failure ).toContainText( `check your internet connection` )
        await expect( page.getByText( /invalid.*api.*key/i ) ).toHaveCount( 0 )
        await expect( key_input( page ) ).toHaveValue( `sk-or-new-key-123` )

    } )

} )
