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

    test( `accepts a valid API key and redirects to library`, async ( { page } ) => {

        await mock_auth( page )
        await page.goto( `/` )
        await page.locator( `input` ).fill( `sk-or-valid-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await page.waitForURL( `**/library`, { timeout: 10_000 } )
        expect( page.url() ).toContain( `/library` )

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
