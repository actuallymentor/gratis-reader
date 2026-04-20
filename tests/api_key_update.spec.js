import { test, expect } from '@playwright/test'
import { setup_api_key, clear_storage, mock_auth } from './helpers/setup.js'

test.describe( `API Key Management`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
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

        // Click Update
        await page.getByText( `Update`, { exact: true } ).click()
        await page.waitForTimeout( 300 )

        // Input should appear
        const input = page.locator( `input[placeholder*="sk-or"]` )
        await expect( input ).toBeVisible()

    } )

    test( `cancel hides update input`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Open update input
        await page.getByText( `Update`, { exact: true } ).click()
        await page.waitForTimeout( 300 )

        // Cancel
        await page.getByText( `Cancel`, { exact: true } ).click()
        await page.waitForTimeout( 300 )

        // Input should be gone, masked key should be back
        const code = page.locator( `code` ).first()
        await expect( code ).toBeVisible()

    } )

    test( `saving new key updates the masked display`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Open update input
        await page.getByText( `Update`, { exact: true } ).click()
        await page.waitForTimeout( 300 )

        // Enter new key
        await page.locator( `input[placeholder*="sk-or"]` ).fill( `sk-or-brand-new-key-ABCD` )
        await page.getByText( `Save`, { exact: true } ).click()

        // Wait for validation + save (async now)
        await page.waitForTimeout( 1500 )

        // Masked display should show new key suffix
        const code = page.locator( `code` ).first()
        const text = await code.textContent()
        expect( text ).toContain( `ABCD` )

    } )

    test( `rejects invalid API key with error toast`, async ( { page } ) => {

        // Override mock to reject
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        await page.getByText( `Update`, { exact: true } ).click()
        await page.locator( `input[placeholder*="sk-or"]` ).fill( `sk-or-bad-key` )
        await page.getByText( `Save`, { exact: true } ).click()
        await page.waitForTimeout( 1500 )

        // Should show error toast
        await expect( page.getByText( /invalid api key/i ) ).toBeVisible( { timeout: 3000 } )

        // Input should still be visible (not dismissed)
        await expect( page.locator( `input[placeholder*="sk-or"]` ) ).toBeVisible()

    } )

    test( `updated key persists after reload`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Update key
        await page.getByText( `Update`, { exact: true } ).click()
        await page.locator( `input[placeholder*="sk-or"]` ).fill( `sk-or-persistent-new-WXYZ` )
        await page.getByText( `Save`, { exact: true } ).click()
        await page.waitForTimeout( 1500 )

        // Close settings and reload
        await page.keyboard.press( `Escape` )
        await page.reload( { waitUntil: `networkidle` } )

        // Re-open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )

        // Verify key survived
        const code = page.locator( `code` ).first()
        const text = await code.textContent()
        expect( text ).toContain( `WXYZ` )

    } )

} )
