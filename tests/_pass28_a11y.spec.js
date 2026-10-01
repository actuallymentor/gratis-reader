/**
 * Pass 28 — Accessibility tests for aria-label and dialog role fixes.
 */
import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { setup_api_key, upload_demo_book, mock_openrouter, mock_auth } from './helpers/setup.js'
import { CHAT_URL, parse_chat_request, fulfil_chat, answer_request } from './helpers/openrouter_mock.js'

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
        await page.route( CHAT_URL, async route => {
            const request = parse_chat_request( route.request().postDataJSON() )
            await fulfil_chat( route, answer_request( request, {
                word: () => `[TRANSLATED] unknown`,
                explanation: () => `**Breakdown:** test → test`
            } ) )
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

        // Modal should have role="dialog" and be modal
        const dialog = page.getByRole( `dialog`, { name: `Choose Your Language` } )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )

        // A native <dialog> opened with showModal() is implicitly aria-modal (no attribute needed)
        expect( await dialog.evaluate( element => element.matches( `:modal` ) ) ).toBe( true )

    } )

} )
