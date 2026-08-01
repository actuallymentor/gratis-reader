import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'

test.describe( `Reader`, () => {

    test.use( { app_state: `reader` } )

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
    } )

    test( `renders chapter content with sentences`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Should have sentence spans
        const sentences = page.locator( `span[data-sentence-id]` )
        const count = await sentences.count()
        expect( count ).toBeGreaterThan( 0 )

    } )

    test( `navigates to the next chapter via button`, async ( { page } ) => {

        await open_seeded_reader( page )

        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_text = await first_sentence.textContent()

        // Click Next
        await page.getByRole( `button`, { name: /Next/ } ).click()

        // Content should change
        await expect( first_sentence ).not.toHaveText( first_text )

    } )

    test( `navigates chapters via keyboard arrows`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Get the first sentence ID to track position
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Press ArrowRight to go to next chapter
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

        // Press ArrowLeft to go back
        await page.keyboard.press( `ArrowLeft` )
        await expect( first_sentence ).toHaveAttribute( `data-sentence-id`, first_id )

    } )

    test( `shows a progress indicator`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Should see progress text like "1 / X · Y%"
        const progress = page.locator( `text=/\\d+ \\/ \\d+ · \\d+%/` )
        await expect( progress ).toBeVisible()

    } )

    test( `back button returns to the library`, async ( { page } ) => {

        await open_seeded_reader( page )

        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `Escape key returns to the library`, async ( { page } ) => {

        await open_seeded_reader( page )

        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
        expect( page.url() ).toContain( `/library` )

    } )

    test( `TOC dropdown changes chapter`, async ( { page } ) => {

        await open_seeded_reader( page )

        const select = page.locator( `select` )
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

        await expect( select ).toBeVisible()
        await expect.poll( () => select.locator( `option` ).count() ).toBeGreaterThan( 3 )

        // Select a later chapter
        await select.selectOption( { index: 3 } )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

    } )

    test( `swipe left navigates to next chapter`, async ( { page } ) => {

        await open_seeded_reader( page )

        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

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

        // Swipe should navigate to next chapter — content changes
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

    } )

    test( `tap-edge navigation advances chapter when clicking empty area`, async ( { page } ) => {

        await open_seeded_reader( page )

        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )

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

        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

    } )

    test( `restores reading progress for returning reader`, async ( { page } ) => {

        await open_seeded_reader( page )

        // Navigate to chapter 3
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        const second_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, second_id )

        const ch3_id = await first_sentence.getAttribute( `data-sentence-id` )

        // Go back to library
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library` )

        // Re-open the book
        await open_seeded_reader( page )

        // Should NOT show language modal (returning reader)
        await expect( page.getByText( `Choose Your Language` ) ).not.toBeVisible()

        // Should be on chapter 3
        await expect( page.locator( `span[data-sentence-id]` ).first() )
            .toHaveAttribute( `data-sentence-id`, ch3_id )

    } )

} )
