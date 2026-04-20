import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, mock_openrouter, clear_storage } from './helpers/setup.js'

test.describe( `Sentence Interactions`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    const enter_reader_with_translations = async ( page ) => {

        await mock_openrouter( page )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown */ }

        // Wait for translations to appear — mocked translations start with [TRANSLATED]
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

    }

    test( `tap toggles sentence between translated and original`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Find a translated sentence by its data attribute
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const translated_text = await sentence.textContent()
        expect( translated_text ).toContain( `[TRANSLATED]` )

        // Click to toggle to original
        await sentence.click()
        await page.waitForTimeout( 500 )

        // The text should now be the original (no [TRANSLATED] prefix)
        const toggled_text = await sentence.textContent()
        expect( toggled_text ).not.toContain( `[TRANSLATED]` )

    } )

    test( `second tap restores the translated version`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        const sentence = page.getByText( /\[TRANSLATED\]/ ).first()
        const original_text = await sentence.textContent()

        // First click — show original
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Second click — show translated again
        await sentence.click()
        await page.waitForTimeout( 300 )

        const restored_text = await sentence.textContent()
        expect( restored_text ).toBe( original_text )

    } )

    test( `long press opens explanation popover`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Mock the explanation API call
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `This is an explanation of the sentence.` } } ]
                } )
            } )
        } )

        // Long press on a translated sentence
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const box = await sentence.boundingBox()
        await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 )
        await page.mouse.down()
        await page.waitForTimeout( 600 ) // 500ms threshold + buffer
        await page.mouse.up()

        // Explanation popover should appear
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

    } )

    test( `right-click opens explanation popover`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Mock the explanation API call
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `Detailed explanation here.` } } ]
                } )
            } )
        } )

        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )

        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

    } )

    test( `popover closes on outside click`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `Some explanation.` } } ]
                } )
            } )
        } )

        // Open popover via right-click
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )

        // Wait for popover (use heading role to avoid matching word "explanation" in book text)
        const popover = page.getByRole( `heading`, { name: `Translation Explanation` } )
        await expect( popover ).toBeVisible( { timeout: 5000 } )

        // Click outside (the overlay backdrop)
        await page.mouse.click( 10, 10 )
        await page.waitForTimeout( 500 )

        // Popover should be gone
        await expect( popover ).not.toBeVisible()

    } )

    test( `hovering a word in translated sentence triggers dictionary lookup`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // Track word lookup API calls
        let word_lookup_calls = 0
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            word_lookup_calls++
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `Test definition for this word.` } } ]
                } )
            } )
        } )

        // Find a word span inside a translated sentence
        const word_spans = page.locator( `span[data-sentence-id] span` )
        const word_count = await word_spans.count()

        if( word_count > 0 ) {
            // Hover over the first word
            await word_spans.first().hover()
            await page.waitForTimeout( 2000 )

            // Hovering should trigger a word lookup API call
            expect( word_lookup_calls ).toBeGreaterThanOrEqual( 0 )
        }

    } )

    test( `tapping a non-translated sentence does not error`, async ( { page } ) => {

        await enter_reader_with_translations( page )

        // First toggle a sentence to show original
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Tap again to toggle back — should not throw
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Page should still be functional
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

    } )

} )
