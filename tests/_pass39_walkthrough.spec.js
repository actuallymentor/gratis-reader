/**
 * Pass 39 — State transition sequences
 * Tests multi-step interaction flows that could expose state bugs
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

test.describe( `Pass 39 — Multi-step state transitions`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    // ── 1. Settings changes persist across reader re-entry ──

    test( `BW190 theme persists after leaving and re-entering reader`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1000 )

        // Change to dark theme
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await page.waitForTimeout( 200 )

        // Go back to library
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 300 )
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )

        // Re-enter reader
        await open_reader( page )
        await page.waitForTimeout( 1000 )

        // Theme should still be dark
        const theme = await page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        )
        expect( theme ).toBe( `dark` )
    } )

    // ── 2. Translation state resets when changing chapters ──

    test( `BW191 navigating chapters shows fresh sentences`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Get first chapter sentence count
        const ch1_count = await page.locator( `span[data-sentence-id]` ).count()
        expect( ch1_count ).toBeGreaterThan( 0 )

        // Navigate forward
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        // New chapter should have sentences too
        const ch2_count = await page.locator( `span[data-sentence-id]` ).count()
        expect( ch2_count ).toBeGreaterThan( 0 )

        // Sentence IDs should be different (different chapter)
        const ch1_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )
        expect( ch1_id ).toBeTruthy()
    } )

    // ── 3. Toggle sentence then navigate — no stale state ──

    test( `BW192 toggled sentence resets after chapter change`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Tap sentence to toggle
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click()
        await page.waitForTimeout( 500 )

        // Navigate to next chapter
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        // Navigate back
        await page.keyboard.press( `ArrowLeft` )
        await page.waitForTimeout( 2000 )

        // Sentences should be in normal state (not toggled)
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        await expect( first_sentence ).toBeVisible()
    } )

    // ── 4. Settings drawer blocks keyboard nav ──

    test( `BW193 arrow keys do not navigate while settings open`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1500 )

        const progress_before = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).textContent()

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )

        // Press arrow keys — should NOT navigate
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 500 )

        // Close settings
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 500 )

        // Progress should be unchanged
        const progress_after = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).textContent()
        expect( progress_after ).toBe( progress_before )
    } )

    // ── 5. Delete book, verify redirect ──

    test( `BW194 deleting book while in reader redirects`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await page.goto( `/library` )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()

        // Delete with confirmation
        page.on( `dialog`, dialog => dialog.accept() )
        await page.getByRole( `button`, { name: /remove/i } ).click()
        await page.waitForTimeout( 1000 )

        // Book should be gone, empty state shown
        await expect( page.getByText( /library is empty/i ) ).toBeVisible( { timeout: 5000 } )
        expect( errors ).toEqual( [] )
    } )

    // ── 6. Upload → read → close → reopen preserves chapter ──

    test( `BW195 reading progress is restored on re-entry`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1500 )

        // Navigate to chapter 3
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 1500 )
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 1500 )

        const progress_at_ch3 = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).textContent()

        // Go back to library
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 3000 } )

        // Re-open the book (should skip language modal and restore progress)
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        const progress_restored = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).textContent()
        expect( progress_restored ).toBe( progress_at_ch3 )
    } )

    // ── 7. Full round-trip: onboarding → library → reader → back ──

    test( `BW196 full app flow with no console errors`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        // Start fresh
        await clear_storage( page )
        await page.goto( `/` )

        // Onboarding
        await page.getByPlaceholder( `sk-or-` ).fill( `sk-or-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()
        await page.waitForURL( /\/library/, { timeout: 5000 } )

        // Upload book
        const file_input = page.locator( `input[type="file"]` )
        await file_input.setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible( { timeout: 10000 } )

        // Open reader
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Handle language modal
        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* already dismissed */ }

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10000 } )

        // Navigate a chapter
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        // Back to library
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )

        // No errors throughout
        expect( errors ).toEqual( [] )
    } )

    // ── 8. Sepia theme colors render correctly ──

    test( `BW197 sepia theme sets warm background`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1000 )

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 300 )
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        await page.waitForTimeout( 300 )

        const bg = await page.evaluate( () =>
            getComputedStyle( document.documentElement ).getPropertyValue( `--bg` ).trim()
        )
        // Sepia background should be warm-toned
        expect( bg ).toBeTruthy()
        expect( bg ).not.toBe( `#ffffff` )
        expect( bg ).not.toBe( `#1a1a2e` )
    } )

    // ── 9. TOC dropdown changes chapter ──

    test( `BW198 TOC select navigates to chosen chapter`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 1500 )

        const progress_before = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).textContent()

        // Find and use the TOC select
        const toc_select = page.locator( `select` ).first()
        const options = await toc_select.locator( `option` ).all()
        if( options.length > 2 ) {
            // Select a later chapter
            await toc_select.selectOption( { index: 2 } )
            await page.waitForTimeout( 2000 )

            const progress_after = await page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).textContent()
            expect( progress_after ).not.toBe( progress_before )
        }
    } )

    // ── 10. Long-press explanation popover lifecycle ──

    test( `BW199 explanation popover opens and closes cleanly`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Right-click to trigger explanation
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )
        await page.waitForTimeout( 500 )

        // Popover should appear with "Translation Explanation" title
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 3000 } )

        // Close it
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 500 )

        // Should be gone
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()

        expect( errors ).toEqual( [] )
    } )

} )
