import { test, expect } from './helpers/app_fixture.js'
import { mock_auth } from './helpers/setup.js'

test.describe( `API Key Management`, () => {

    test.use( { app_state: `authenticated` } )

    test.beforeEach( async ( { page } ) => {
        await mock_auth( page )
    } )

    test( `shows masked API key in settings`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Look for masked key display (e.g. "sk-or-...fake")
        const code = page.locator( `code` ).first()
        await expect( code ).toBeVisible()
        const text = await code.textContent()
        expect( text ).toContain( `...` )

    } )

    test( `update button reveals input field`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Click Update Key
        await page.getByText( `Update Key`, { exact: true } ).click()

        // Input should appear
        const input = page.locator( `input[placeholder*="sk-or"]` )
        await expect( input ).toBeVisible()

    } )

    test( `cancel hides update input`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Open update input
        await page.getByText( `Update Key`, { exact: true } ).click()
        const input = page.locator( `input[placeholder*="sk-or"]` )
        await expect( input ).toBeVisible()

        // Cancel
        await page.getByText( `Cancel`, { exact: true } ).click()
        await expect( input ).not.toBeVisible()

        // Input should be gone, masked key should be back
        const code = page.locator( `code` ).first()
        await expect( code ).toBeVisible()

    } )

    test( `saving new key updates the masked display`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Open update input
        await page.getByText( `Update Key`, { exact: true } ).click()

        // Enter new key
        await page.locator( `input[placeholder*="sk-or"]` ).fill( `sk-or-brand-new-key-ABCD` )
        await page.getByText( `Save`, { exact: true } ).click()

        // Masked display should show new key suffix
        const code = page.locator( `code` ).first()
        await expect( code ).toContainText( `ABCD` )

    } )

    test( `rejects invalid API key with error toast`, async ( { page } ) => {

        // Override mock to reject
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        await page.getByText( `Update Key`, { exact: true } ).click()
        await page.locator( `input[placeholder*="sk-or"]` ).fill( `sk-or-bad-key` )
        await page.getByText( `Save`, { exact: true } ).click()

        // Should show error toast
        await expect( page.getByText( /invalid api key/i ) ).toBeVisible( { timeout: 3000 } )

        // Input should still be visible (not dismissed)
        await expect( page.locator( `input[placeholder*="sk-or"]` ) ).toBeVisible()

    } )

    test( `updated key persists after reload`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Update key
        await page.getByText( `Update Key`, { exact: true } ).click()
        await page.locator( `input[placeholder*="sk-or"]` ).fill( `sk-or-persistent-new-WXYZ` )
        await page.getByText( `Save`, { exact: true } ).click()
        await expect( page.locator( `code` ).first() ).toContainText( `WXYZ` )

        // Close settings and reload
        await page.keyboard.press( `Escape` )
        await page.reload( { waitUntil: `networkidle` } )

        // Re-open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Verify key survived
        const code = page.locator( `code` ).first()
        await expect( code ).toContainText( `WXYZ` )

    } )

} )
