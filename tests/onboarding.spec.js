import { test, expect } from '@playwright/test'
import { clear_storage, mock_auth } from './helpers/setup.js'

test.describe( `Onboarding`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
    } )

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
        await page.getByRole( `button`, { name: `Connect` } ).click()

        // Should stay on onboarding
        await page.waitForTimeout( 2000 )
        expect( page.url() ).not.toContain( `/library` )

    } )

    test( `shows loading while validating an entered API key`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await new Promise( resolve => setTimeout( resolve, 500 ) )
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { data: { label: `test-key` } } )
            } )
        } )

        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-valid-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await expect( page.getByText( `Checking OpenRouter API key...` ) ).toBeVisible()
        await page.waitForURL( `**/library`, { timeout: 10_000 } )

    } )

    test( `accepts a valid API key and redirects to library`, async ( { page } ) => {

        await mock_auth( page )
        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-valid-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await page.waitForURL( `**/library`, { timeout: 10_000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `validates API key from URL fragment and stores it`, async ( { page } ) => {

        let authorization_header

        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            authorization_header = route.request().headers().authorization
            await new Promise( resolve => setTimeout( resolve, 500 ) )
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { data: { label: `test-key` } } )
            } )
        } )

        await page.goto( `/#openrouter_api_key=sk-or-fragment-key-1234` )

        await expect( page.getByText( `Checking OpenRouter API key...` ) ).toBeVisible()
        await expect( page.locator( `input[type="password"]` ) ).toBeHidden()
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

        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await new Promise( resolve => setTimeout( resolve, 500 ) )
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        await page.goto( `/library#openrouter_api_key=sk-or-bad-fragment-key` )

        await expect( page.getByText( `Checking OpenRouter API key...` ) ).toBeVisible()
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

        // Reload — should still be on library
        await page.reload( { waitUntil: `networkidle` } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `redirects to library on load if key already exists`, async ( { page } ) => {

        // Manually set key in storage
        await page.goto( `/` )
        await page.evaluate( () => {
            const store = { state: { api_key: `sk-or-existing-key` }, version: 0 }
            localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
        } )

        await page.goto( `/` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

} )
