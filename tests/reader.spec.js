import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, mock_openrouter, clear_storage } from './helpers/setup.js'

test.describe( `Reader`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
        await mock_openrouter( page )
        await upload_demo_book( page )
    } )

    const open_book = async ( page ) => {

        // Click the book cover
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Dismiss the language modal if it appears
        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        try {
            await start_btn.waitFor( { state: `visible`, timeout: 3000 } )
            await start_btn.click()
        } catch { /* modal not shown — returning reader */ }

        // Wait for sentence content
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

    }

    test( `renders chapter content with sentences`, async ( { page } ) => {

        await open_book( page )

        // Should have sentence spans
        const sentences = page.locator( `span[data-sentence-id]` )
        const count = await sentences.count()
        expect( count ).toBeGreaterThan( 0 )

    } )

    test( `navigates to the next chapter via button`, async ( { page } ) => {

        await open_book( page )

        const first_sentence = await page.locator( `span[data-sentence-id]` ).first().textContent()

        // Click Next
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 2000 )

        // Content should change
        const new_sentence = await page.locator( `span[data-sentence-id]` ).first().textContent()
        expect( new_sentence ).not.toBe( first_sentence )

    } )

    test( `navigates chapters via keyboard arrows`, async ( { page } ) => {

        await open_book( page )

        // Get the first sentence ID to track position
        const first_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )

        // Press ArrowRight to go to next chapter
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        const new_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )
        expect( new_id ).not.toBe( first_id )

        // Press ArrowLeft to go back
        await page.keyboard.press( `ArrowLeft` )
        await page.waitForTimeout( 2000 )

        const back_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )
        expect( back_id ).toBe( first_id )

    } )

    test( `shows a progress indicator`, async ( { page } ) => {

        await open_book( page )

        // Should see progress text like "1 / X · Y%"
        const progress = page.locator( `text=/\\d+ \\/ \\d+ · \\d+%/` )
        await expect( progress ).toBeVisible()

    } )

    test( `back button returns to the library`, async ( { page } ) => {

        await open_book( page )

        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `Escape key returns to the library`, async ( { page } ) => {

        await open_book( page )

        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `TOC dropdown changes chapter`, async ( { page } ) => {

        await open_book( page )

        const select = page.locator( `select` )
        if( await select.isVisible().catch( () => false ) ) {

            const first_text = await page.locator( `span[data-sentence-id]` ).first().textContent()

            // Select a later chapter
            await select.selectOption( { index: 3 } )
            await page.waitForTimeout( 2000 )

            const new_text = await page.locator( `span[data-sentence-id]` ).first().textContent()
            expect( new_text ).not.toBe( first_text )

        }

    } )

    test( `swipe left navigates to next chapter`, async ( { page } ) => {

        await open_book( page )

        const first_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )

        // Simulate swipe left via dispatching touch events directly in the browser
        const main = page.locator( `main` )
        const box = await main.boundingBox()

        await page.evaluate( ( { bx, bw, by, bh } ) => {
            const el = document.querySelector( `main` )
            const start_x = bx + bw * 0.8
            const end_x = bx + bw * 0.2
            const y = by + bh / 2

            el.dispatchEvent( new TouchEvent( `touchstart`, {
                bubbles: true,
                touches: [ new Touch( { identifier: 0, target: el, clientX: start_x, clientY: y } ) ]
            } ) )
            el.dispatchEvent( new TouchEvent( `touchmove`, {
                bubbles: true,
                touches: [ new Touch( { identifier: 0, target: el, clientX: end_x, clientY: y } ) ]
            } ) )
            el.dispatchEvent( new TouchEvent( `touchend`, {
                bubbles: true,
                changedTouches: [ new Touch( { identifier: 0, target: el, clientX: end_x, clientY: y } ) ]
            } ) )
        }, { bx: box.x, bw: box.width, by: box.y, bh: box.height } )

        await page.waitForTimeout( 2000 )

        const new_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )

        // Swipe should navigate to next chapter — content changes
        expect( new_id ).not.toBe( first_id )

    } )

    test( `tap-edge navigation advances chapter when clicking empty area`, async ( { page } ) => {

        await open_book( page )

        const first_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )

        // Dispatch a click on the right edge of main, bypassing child element targeting.
        // In real usage, this fires when a user clicks in the padding zone outside text content.
        const main = page.locator( `main` )
        const box = await main.boundingBox()

        await page.evaluate( ( { bx, bw, by, bh } ) => {
            const main = document.querySelector( `main` )
            const x = bx + bw * 0.95
            const y = by + bh / 2
            // Dispatch click directly on main (simulating click on empty padding area)
            const event = new MouseEvent( `click`, {
                bubbles: true, clientX: x, clientY: y
            } )
            // Override target check — set the event target to main itself
            Object.defineProperty( event, `target`, { value: main } )
            main.dispatchEvent( event )
        }, { bx: box.x, bw: box.width, by: box.y, bh: box.height } )

        await page.waitForTimeout( 2000 )

        const new_id = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )
        expect( new_id ).not.toBe( first_id )

    } )

    test( `restores reading progress for returning reader`, async ( { page } ) => {

        await open_book( page )

        // Navigate to chapter 3
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 1500 )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 1500 )

        const ch3_text = await page.locator( `span[data-sentence-id]` ).first().textContent()

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Re-open the book
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.waitForTimeout( 3000 )

        // Should NOT show language modal (returning reader)
        await expect( page.getByText( `Choose Your Language` ) ).not.toBeVisible()

        // Should be on chapter 3
        const restored_text = await page.locator( `span[data-sentence-id]` ).first().textContent()
        expect( restored_text ).toBe( ch3_text )

    } )

} )
