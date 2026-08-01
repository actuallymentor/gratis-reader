/**
 * Pass 28 — Accessibility tests for aria-label and dialog role fixes.
 */
import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { setup_api_key, upload_demo_book, mock_openrouter, mock_auth } from './helpers/setup.js'

test.describe( `Pass 28 — Accessibility`, () => {

    test.use( { app_state: `reader` } )

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
    } )

    test( `P28-01 settings close button has aria-label="Close"`, async ( { page } ) => {
        await open_seeded_reader( page )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( /font size/i ) ).toBeVisible( { timeout: 3000 } )

        // Close button should be findable by aria-label
        const close_btn = page.getByRole( `button`, { name: `Close`, exact: true } )
        await expect( close_btn ).toBeVisible()
        await close_btn.click()
        await expect( page.getByText( /font size/i ) ).not.toBeVisible( { timeout: 3000 } )
    } )

    test( `P28-02 explanation popover close button has aria-label="Close"`, async ( { page } ) => {

        // Override mock to include explanation response
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            if( user_msg.includes( `Explain` ) || user_msg.includes( `phrase-by-phrase` ) ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `**Breakdown:** test → test` } } ] } )
                } )
            } else {
                const match = user_msg.match( /Translate this sentence:\n(.+)/s )
                const sentence = match ? match[1].trim() : `unknown`
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
                } )
            }
        } )

        await open_seeded_reader( page )

        // Open the explanation through the selected word's sheet.
        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await expect( word ).toBeVisible()
        await word.click()
        await page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } ).click()
        await expect( page.getByText( /translation explanation/i ) ).toBeVisible( { timeout: 5000 } )

        // Target the modal close exactly; the persistent sheet has its own close control.
        const close_btn = page.getByRole( `button`, { name: `Close`, exact: true } )
        await expect( close_btn ).toBeVisible()
    } )

    test( `P28-04 back button has aria-label "Back to library"`, async ( { page } ) => {
        await open_seeded_reader( page )
        const back_btn = page.getByRole( `button`, { name: `Back to library` } )
        await expect( back_btn ).toBeVisible()
    } )

    test( `P28-05 settings gear has aria-label "Settings"`, async ( { page } ) => {
        await open_seeded_reader( page )
        const gear = page.getByRole( `button`, { name: `Settings` } )
        await expect( gear ).toBeVisible()
    } )

} )

test.describe( `Pass 28 — First-open accessibility`, () => {

    test.use( { app_state: `empty` } )

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    test( `P28-03 language selection modal has role="dialog"`, async ( { page } ) => {

        // Keep a real upload and first open because the modal is this test's contract.
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Modal should have role="dialog" and aria-modal
        const dialog = page.locator( `[role="dialog"]` )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )

        // Should also have aria-modal="true"
        const aria_modal = await dialog.getAttribute( `aria-modal` )
        expect( aria_modal ).toBe( `true` )

    } )

} )
