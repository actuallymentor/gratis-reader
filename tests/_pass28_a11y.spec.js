/**
 * Pass 28 — Accessibility tests for aria-label and dialog role fixes.
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth } from './helpers/setup.js'

test.describe( `Pass 28 — Accessibility`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
        await upload_demo_book( page )
    } )

    test( `P28-01 settings close button has aria-label="Close"`, async ( { page } ) => {
        await open_reader( page )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( /font size/i ) ).toBeVisible( { timeout: 3000 } )

        // Close button should be findable by aria-label
        const close_btn = page.getByRole( `button`, { name: `Close` } )
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

        await open_reader( page )
        await page.waitForTimeout( 3000 )

        // Right-click to open explanation
        await page.locator( `span[data-sentence-id]` ).first().click( { button: `right` } )
        await expect( page.getByText( /translation explanation/i ) ).toBeVisible( { timeout: 5000 } )

        // Close button should be findable by aria-label
        const close_btn = page.getByRole( `button`, { name: `Close` } )
        await expect( close_btn ).toBeVisible()
    } )

    test( `P28-03 language selection modal has role="dialog"`, async ( { page } ) => {
        // Clear progress to force modal to show
        await page.evaluate( () => {
            return new Promise( r => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    if( !db.objectStoreNames.contains( `progress` ) ) { r(); return }
                    const tx = db.transaction( `progress`, `readwrite` )
                    tx.objectStore( `progress` ).clear()
                    tx.oncomplete = r; tx.onerror = r
                }
                req.onerror = r
            } )
        } )

        // Open the book (should show language modal)
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.waitForTimeout( 2000 )

        // Modal should have role="dialog" and aria-modal
        const dialog = page.locator( `[role="dialog"]` )
        await expect( dialog ).toBeVisible( { timeout: 5000 } )

        // Should also have aria-modal="true"
        const aria_modal = await dialog.getAttribute( `aria-modal` )
        expect( aria_modal ).toBe( `true` )
    } )

    test( `P28-04 back button has aria-label "Back to library"`, async ( { page } ) => {
        await open_reader( page )
        const back_btn = page.getByRole( `button`, { name: `Back to library` } )
        await expect( back_btn ).toBeVisible()
    } )

    test( `P28-05 settings gear has aria-label "Settings"`, async ( { page } ) => {
        await open_reader( page )
        const gear = page.getByRole( `button`, { name: `Settings` } )
        await expect( gear ).toBeVisible()
    } )

} )
