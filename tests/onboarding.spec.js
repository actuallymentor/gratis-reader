import { test, expect } from './helpers/app_fixture.js'
import { mock_auth } from './helpers/setup.js'

const deferred = () => {
    let release
    const promise = new Promise( resolve => {
        release = resolve
    } )
    return { promise, release }
}

test.describe( `Onboarding`, () => {

    test.use( { app_state: `empty` } )

    test( `shows onboarding page when no API key is stored`, async ( { page } ) => {
        await page.goto( `/` )
        await expect( page.getByText( `Gratis Reader` ) ).toBeVisible()
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
        await expect( page.getByRole( `button`, { name: `Connect` } ) ).toBeVisible()
    } )

    test( `validates and rejects an invalid API key`, async ( { page } ) => {

        // Mock auth to reject
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        await page.goto( `/` )
        await page.locator( `input` ).fill( `invalid-key` )
        const rejection = page.waitForResponse( `**/openrouter.ai/api/v1/auth/key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()
        await rejection

        // Should stay on onboarding
        await expect( page.getByText( `Invalid API key — please check and try again` ) ).toBeVisible()
        await expect( page ).not.toHaveURL( /\/library/ )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()

    } )

    test( `shows loading while validating an entered API key`, async ( { page } ) => {

        const validation = deferred()
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await validation.promise
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { data: { label: `test-key` } } )
            } )
        } )

        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-valid-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await expect( page.getByText( `Checking OpenRouter API key...` ) ).toBeVisible()
        validation.release()
        await page.waitForURL( `**/library`, { timeout: 10_000 } )

    } )

    test( `accepts a valid API key and redirects to library`, async ( { page } ) => {

        await mock_auth( page )
        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-valid-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await expect( page.getByText( `Connected!` ) ).toBeVisible()
        await page.waitForURL( `**/library`, { timeout: 10_000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `submits the API key with Enter`, async ( { page } ) => {

        await mock_auth( page )
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `sk-or-enter-key` )
        await page.keyboard.press( `Enter` )

        await page.waitForURL( `**/library`, { timeout: 10_000 } )

    } )

    test( `keeps Connect disabled for an empty or whitespace-only key`, async ( { page } ) => {

        await mock_auth( page )
        await page.goto( `/` )

        const input = page.locator( `input` )
        const connect = page.getByRole( `button`, { name: `Connect` } )

        await input.fill( `` )
        await expect( connect ).toBeDisabled()

        await input.fill( `   ` )
        await expect( connect ).toBeDisabled()

        // Sanity: a real key enables it, so the disabled state above is meaningful
        await input.fill( `sk-or-real-key` )
        await expect( connect ).toBeEnabled()

    } )

    test( `shows a network error, not an invalid-key error, when validation cannot connect`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/auth/key`, route => route.abort( `connectionrefused` ) )

        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-test-key-123` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await expect( page.getByText( `Could not connect` ) ).toBeVisible()
        await expect( page.getByText( /invalid api key/i ) ).toHaveCount( 0 )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()

    } )

    test( `sends protected routes back to onboarding without a key`, async ( { page } ) => {

        for( const path of [ `/library`, `/read/fakeid` ] ) {
            await page.goto( path )
            await page.waitForURL( url => url.pathname === `/` )
            await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
        }

    } )

    test( `still renders onboarding when the stored settings JSON is corrupt`, async ( { page } ) => {

        // Seed the corrupt value before any app script runs: no extra navigation
        await page.addInitScript( () => localStorage.setItem( `settings-storage`, `NOT VALID JSON!!!` ) )

        await page.goto( `/` )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
        await expect( page.getByRole( `button`, { name: `Connect` } ) ).toBeVisible()

    } )

    test( `validates API key from URL fragment and stores it`, async ( { page } ) => {

        let authorization_header
        const validation = deferred()

        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            authorization_header = route.request().headers().authorization
            await validation.promise
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { data: { label: `test-key` } } )
            } )
        } )

        await page.goto( `/#openrouter_api_key=sk-or-fragment-key-1234` )

        await expect( page.getByText( `Checking OpenRouter API key...` ) ).toBeVisible()
        await expect( page.locator( `input[type="password"]` ) ).toBeHidden()
        validation.release()
        await page.waitForURL( `**/library`, { timeout: 10_000 } )

        expect( page.url() ).not.toContain( `openrouter_api_key` )
        expect( authorization_header ).toBe( `Bearer sk-or-fragment-key-1234` )

        const stored_key = await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            return store.state?.api_key
        } )

        expect( stored_key ).toBe( `sk-or-fragment-key-1234` )

    } )

    test( `rejects invalid API key from URL fragment`, async ( { page } ) => {

        const validation = deferred()
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await validation.promise
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        await page.goto( `/library#openrouter_api_key=sk-or-bad-fragment-key` )

        await expect( page.getByText( `Checking OpenRouter API key...` ) ).toBeVisible()
        validation.release()
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible( { timeout: 10_000 } )

        expect( page.url() ).not.toContain( `openrouter_api_key` )

        const stored_key = await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            return store.state?.api_key || null
        } )

        expect( stored_key ).toBeNull()

    } )

    test( `ignores API key in query param`, async ( { page } ) => {

        let validation_requests = 0

        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            validation_requests += 1
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { data: { label: `test-key` } } )
            } )
        } )

        await page.goto( `/?openrouter_api_key=sk-or-query-param-key-ignored` )

        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
        expect( page.url() ).not.toContain( `openrouter_api_key` )
        expect( validation_requests ).toBe( 0 )

        const stored_key = await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            return store.state?.api_key || null
        } )

        expect( stored_key ).toBeNull()

    } )

    test( `persists the key across page reloads`, async ( { page } ) => {

        await mock_auth( page )
        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-persistent-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()
        await page.waitForURL( `**/library`, { timeout: 10_000 } )

        // Reload — should still be on library, not bounced to onboarding
        await page.reload()
        await expect( page.getByText( `Your library is empty` ) ).toBeVisible( { timeout: 15_000 } )
        expect( page.url() ).toContain( `/library` )

    } )

} )

test.describe( `Onboarding with a stored key`, () => {

    test.use( { app_state: `authenticated` } )

    test( `redirects to library on load if key already exists`, async ( { page } ) => {
        await page.goto( `/` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )
    } )

} )
