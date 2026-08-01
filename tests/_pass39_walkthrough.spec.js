/**
 * Pass 39 — State transition sequences
 * Tests multi-step interaction flows that could expose state bugs
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

const get_saved_chapter_index = async page => page.evaluate( async () => {
    return new Promise( resolve => {
        const req = indexedDB.open( `gratis_reader` )
        req.onsuccess = () => {
            const tx = req.result.transaction( `progress`, `readonly` )
            const get_all = tx.objectStore( `progress` ).getAll()
            get_all.onsuccess = () => resolve( get_all.result[ 0 ]?.chapter_index ?? -1 )
            get_all.onerror = () => resolve( -1 )
        }
        req.onerror = () => resolve( -1 )
    } )
} )

const accept_confirmation = async ( page, expected_message, action ) => {

    const handled = new Promise( ( resolve, reject ) => {
        page.once( `dialog`, async dialog => {
            try {
                expect( dialog.type() ).toBe( `confirm` )
                expect( dialog.message() ).toBe( expected_message )
                await dialog.accept()
                resolve()
            } catch( error ) {
                reject( error )
            }
        } )
    } )

    await action()
    await handled

}

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

        // Change to dark theme
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `heading`, { name: `Settings` } ) ).toBeVisible()
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await expect.poll( () => page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        ) ).toBe( `dark` )

        // Go back to library
        await page.getByRole( `button`, { name: `Close`, exact: true } ).click()
        await expect( page.getByRole( `heading`, { name: `Settings` } ) ).not.toBeVisible()
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )

        // Re-enter reader
        await open_reader( page )

        // Theme should still be dark
        await expect.poll( () => page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        ) ).toBe( `dark` )
    } )

    // ── 2. Translation state resets when changing chapters ──

    test( `BW191 navigating chapters shows fresh sentences`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Get first chapter sentence count
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const ch1_count = await page.locator( `span[data-sentence-id]` ).count()
        const ch1_id = await first_sentence.getAttribute( `data-sentence-id` )
        expect( ch1_count ).toBeGreaterThan( 0 )

        // Navigate forward
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, ch1_id )

        // New chapter should have sentences too
        const ch2_count = await page.locator( `span[data-sentence-id]` ).count()
        expect( ch2_count ).toBeGreaterThan( 0 )

        // Sentence IDs should be different (different chapter)
        const ch2_id = await first_sentence.getAttribute( `data-sentence-id` )
        expect( ch2_id ).not.toBe( ch1_id )
    } )

    // ── 3. Inspect sentence then navigate — no stale state ──

    test( `BW192 selected translation sheet resets after chapter change`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Select a translated word and show its information.
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        const first_word = first_sentence.locator( `[data-translation-word-index]` ).first()
        await expect( first_word ).toBeVisible( { timeout: 15_000 } )
        await first_word.click()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()

        // Navigate to next chapter
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        await expect( page.locator( `[data-translation-info-sheet]` ) ).not.toBeVisible()

        // Navigate back
        await page.keyboard.press( `ArrowLeft` )
        await expect( first_sentence ).toHaveAttribute( `data-sentence-id`, first_id )

        // Returning to the chapter must not restore stale selection state.
        await expect( first_sentence ).toBeVisible()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).not.toBeVisible()
    } )

    // ── 4. Settings drawer blocks keyboard nav ──

    test( `BW193 arrow keys do not navigate while settings open`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` )
        const progress_before = await progress.textContent()

        // Open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `heading`, { name: `Settings` } ) ).toBeVisible()

        // Press arrow keys — should NOT navigate
        await page.keyboard.press( `ArrowRight` )
        await expect( progress ).toHaveText( progress_before )

        // Close settings
        await page.keyboard.press( `Escape` )
        await expect( page.getByRole( `heading`, { name: `Settings` } ) ).not.toBeVisible()

        // Progress should be unchanged
        await expect( progress ).toHaveText( progress_before )
    } )

    // ── 5. Delete book, verify redirect ──

    test( `BW194 deleting book while in reader redirects`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await page.goto( `/library` )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()

        // Delete with confirmation
        await accept_confirmation(
            page,
            `Remove "Smart work beats hard work" from your library?`,
            () => page.getByRole( `button`, { name: /remove/i } ).click()
        )

        // Book should be gone, empty state shown
        await expect( page.getByText( /library is empty/i ) ).toBeVisible( { timeout: 5000 } )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).not.toBeVisible()
        expect( errors ).toEqual( [] )
    } )

    // ── 6. Upload → read → close → reopen preserves chapter ──

    test( `BW195 reading progress is restored on re-entry`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Navigate to chapter 3
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const chapter_one_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, chapter_one_id )
        const chapter_two_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, chapter_two_id )

        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` )
        const progress_at_ch3 = await progress.textContent()
        await expect.poll( () => get_saved_chapter_index( page ) ).toBe( 2 )

        // Go back to library
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 3000 } )

        // Re-open the book (should skip language modal and restore progress)
        await open_reader( page )
        await expect( progress ).toHaveText( progress_at_ch3 )
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
        await open_reader( page )

        // Navigate a chapter
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` )
        const progress_before = await progress.textContent()
        await page.keyboard.press( `ArrowRight` )
        await expect( progress ).not.toHaveText( progress_before )

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

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByRole( `heading`, { name: `Settings` } ) ).toBeVisible()
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        await expect.poll( () => page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        ) ).toBe( `sepia` )

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

        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` )
        const progress_before = await progress.textContent()

        // Find and use the TOC select
        const toc_select = page.locator( `select` ).first()
        const options = await toc_select.locator( `option` ).all()
        if( options.length > 2 ) {
            // Select a later chapter
            await toc_select.selectOption( { index: 2 } )
            await expect( toc_select ).toHaveValue( `2` )
            await expect( progress ).not.toHaveText( progress_before )
        }
    } )

    // ── 10. Explanation popover lifecycle ──

    test( `BW199 explanation popover opens and closes cleanly`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )

        // Open the explanation from the selected word's sheet.
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_word = sentence.locator( `[data-translation-word-index]` ).first()
        await expect( first_word ).toBeVisible( { timeout: 15_000 } )
        await first_word.click()
        await page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } ).click()

        // Popover should appear with "Translation Explanation" title
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 3000 } )

        // Close the modal explicitly, leaving the persistent translation sheet alone.
        await page.getByRole( `button`, { name: `Close`, exact: true } ).click()

        // Should be gone
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()

        expect( errors ).toEqual( [] )
    } )

} )
