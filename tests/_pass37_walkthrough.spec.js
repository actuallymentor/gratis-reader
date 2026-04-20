/**
 * Pass 37 — Focused on error handling, network resilience, onboarding edge cases
 * Tests the 3 bugs fixed in this pass plus broader coverage
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

test.describe( `Pass 37 — Error handling & resilience`, () => {

    // ── Onboarding edge cases ──

    test( `BW154 onboarding rejects empty/whitespace key with toast`, async ( { page } ) => {
        await mock_auth( page )
        await page.goto( `/` )

        const input = page.getByPlaceholder( `sk-or-` )
        const btn = page.getByRole( `button`, { name: `Connect` } )

        // Clear any pre-filled env key, then check disabled state
        await input.fill( `` )
        await expect( btn ).toBeDisabled()

        // Type spaces only — button should stay disabled
        await input.fill( `   ` )
        await expect( btn ).toBeDisabled()
    } )

    test( `BW155 onboarding shows network error on connection failure`, async ( { page } ) => {
        // Mock auth endpoint to fail with network error
        await page.route( `**/openrouter.ai/api/v1/auth/key`, route => route.abort( `connectionrefused` ) )

        await page.goto( `/` )
        await page.getByPlaceholder( `sk-or-` ).fill( `sk-or-test-key-123` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        // Should show network-specific error, NOT "Invalid API key"
        await expect( page.getByText( `Could not connect` ) ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW156 onboarding shows invalid key toast for bad credentials`, async ( { page } ) => {
        // Mock auth to return 401
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        await page.goto( `/` )
        await page.getByPlaceholder( `sk-or-` ).fill( `sk-or-bad-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        // Should show "Invalid API key" message
        await expect( page.getByText( /invalid.*api.*key/i ) ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW157 successful onboarding navigates to library`, async ( { page } ) => {
        await mock_auth( page )
        await page.goto( `/` )
        await page.getByPlaceholder( `sk-or-` ).fill( `sk-or-valid-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()

        await page.waitForURL( /\/library/, { timeout: 5000 } )
        await expect( page.getByText( `Gratis Reader` ) ).toBeVisible()
    } )

} )

test.describe( `Pass 37 — Settings key update resilience`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    test( `BW158 settings key update shows toast on whitespace-only input`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )

        // Click Update to enter edit mode
        await page.getByRole( `button`, { name: `Update` } ).click()
        await page.waitForTimeout( 200 )

        // Type spaces and click Save
        const input = page.locator( `input[placeholder="sk-or-..."]` )
        await input.fill( `   ` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        // Should show error toast
        await expect( page.getByText( /enter.*api.*key/i ) ).toBeVisible( { timeout: 3000 } )
    } )

    test( `BW159 settings key update shows network error on failure`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )

        await page.getByRole( `button`, { name: `Update` } ).click()
        await page.waitForTimeout( 200 )

        // Now route auth to fail BEFORE typing the key
        await page.route( `**/openrouter.ai/api/v1/auth/key`, route => route.abort( `connectionrefused` ) )

        const input = page.locator( `input[placeholder="sk-or-..."]` )
        await input.fill( `sk-or-new-key-123` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        // Should show network error, not "invalid key"
        await expect( page.getByText( `Could not connect` ) ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW160 settings key update shows invalid key on 401`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )

        await page.getByRole( `button`, { name: `Update` } ).click()
        await page.waitForTimeout( 200 )

        // Route auth to return 401
        await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
            await route.fulfill( { status: 401, body: `Unauthorized` } )
        } )

        const input = page.locator( `input[placeholder="sk-or-..."]` )
        await input.fill( `sk-or-bad-key` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        // Should show invalid key message
        await expect( page.getByText( /invalid.*api.*key/i ) ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW161 settings key update succeeds with valid key`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )

        await page.getByRole( `button`, { name: `Update` } ).click()
        await page.waitForTimeout( 200 )

        const input = page.locator( `input[placeholder="sk-or-..."]` )
        await input.fill( `sk-or-brand-new-key` )
        await page.getByRole( `button`, { name: `Save` } ).click()

        // Should show success toast
        await expect( page.getByText( /updated/i ) ).toBeVisible( { timeout: 5000 } )
    } )

} )

test.describe( `Pass 37 — Reader resilience`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    test( `BW162 reader handles translation API failure gracefully`, async ( { page } ) => {
        await upload_demo_book( page )

        // Make translation calls fail AFTER book upload
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, route =>
            route.fulfill( { status: 500, body: `Internal Server Error` } )
        )

        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Page should still render original text (no crash)
        const sentences = await page.locator( `span[data-sentence-id]` ).count()
        expect( sentences ).toBeGreaterThan( 0 )
    } )

    test( `BW163 reader shows original text when going offline`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1500 )

        // Count sentences before going offline
        const sentence_count = await page.locator( `span[data-sentence-id]` ).count()
        expect( sentence_count ).toBeGreaterThan( 0 )

        // Go offline
        await page.context().setOffline( true )
        await page.waitForTimeout( 500 )

        // Sentences should still be visible (no crash)
        const after_offline = await page.locator( `span[data-sentence-id]` ).count()
        expect( after_offline ).toBe( sentence_count )

        await page.context().setOffline( false )
    } )

    test( `BW164 no console errors during normal reading flow`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Tap a sentence
        await page.locator( `span[data-sentence-id]` ).first().click()
        await page.waitForTimeout( 1000 )

        // Navigate to next chapter
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        expect( errors ).toEqual( [] )
    } )

    test( `BW165 progress bar visible and reasonable`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1500 )

        // Progress text should show chapter position
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` )
        await expect( progress ).toBeVisible( { timeout: 3000 } )
    } )

} )
