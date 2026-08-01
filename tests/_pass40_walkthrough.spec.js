/**
 * Pass 40 — Read-ahead stress tests and regression checks
 */
import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { mock_auth } from './helpers/setup.js'

const wait_for_translations = async ( page ) => {

    const translating = page.getByText( `Translating...`, { exact: true } )
    await expect( translating ).toBeVisible( { timeout: 5_000 } )
    await expect( translating ).not.toBeVisible( { timeout: 30_000 } )

}

test.describe( `Pass 40 — Read-ahead buffer`, () => {

    test.use( { app_state: `reader` } )

    test( `BW201 read-ahead translates sentences from next chapters`, async ( { page } ) => {
        // Track which sentence IDs are translated (by chapter index in the ID)
        const translated_ids = new Set()

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            translated_ids.add( sentence )

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ]
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        await wait_for_translations( page )

        // Total unique sentences translated should be > sentences on screen
        // because read-ahead pre-translates next 2 chapters
        const visible_count = await page.locator( `span[data-sentence-id]` ).count()
        expect( translated_ids.size ).toBeGreaterThan( visible_count )
    } )

    test( `BW202 navigating forward shows pre-cached translations instantly`, async ( { page } ) => {
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ]
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        await wait_for_translations( page )

        // Block successful API responses after read-ahead so chapter 2 can only use its cache.
        await page.unroute( `**/openrouter.ai/api/v1/chat/completions` )
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, route => route.abort( `connectionrefused` ) )
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )

        // Sentences in chapter 2 should appear (from read-ahead cache)
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )
        await expect( first_sentence ).toContainText( `[TR]` )
    } )

    test( `BW203 rapid navigation does not crash with read-ahead`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ]
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        // Rapidly navigate through 6 chapters
        for( let i = 0; i < 6; i++ ) {
            await page.keyboard.press( `ArrowRight` )
        }

        // The final TOC value proves every rapid key event was processed.
        await expect( page.locator( `select` ).first() ).toHaveValue( `6` )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        // No crashes
        expect( errors ).toEqual( [] )

        // Should still have visible sentences
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW204 read-ahead works on last chapter (edge case)`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ]
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        // Jump to last chapter using TOC
        const toc_select = page.locator( `select` ).first()
        const options = await toc_select.locator( `option` ).all()
        const last_index = options.length - 1
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await toc_select.selectOption( { index: last_index } )
        await expect( toc_select ).toHaveValue( `${ last_index }` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

        // No errors on last chapter (read-ahead has nothing to pre-fetch)
        expect( errors ).toEqual( [] )
        await expect( first_sentence ).toBeVisible( { timeout: 5000 } )
        await expect( page.getByRole( `button`, { name: /Next/ } ) ).toBeDisabled()
    } )

    test( `BW205 language change re-triggers read-ahead translations`, async ( { page } ) => {
        let translation_count = 0

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            translation_count++
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ]
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        await wait_for_translations( page )
        const count_after_load = translation_count

        // Change language directly via zustand store to ensure state change
        await page.evaluate( () => {
            // Access zustand store and change language
            const store_key = `settings-storage`
            const raw = localStorage.getItem( store_key )
            if( raw ) {
                const parsed = JSON.parse( raw )
                parsed.state.last_language = `French`
                localStorage.setItem( store_key, JSON.stringify( parsed ) )
            }
            // Dispatch storage event to trigger zustand rehydration
            window.dispatchEvent( new Event( `storage` ) )
        } )

        // Reload reader to pick up language change
        await page.reload()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // More translations should have been triggered
        await expect.poll( () => translation_count, { timeout: 30_000 } ).toBeGreaterThan( count_after_load )
        await expect( page.getByText( `Translating...`, { exact: true } ) ).not.toBeVisible( { timeout: 30_000 } )
    } )

    test( `BW206 token usage and cost displayed in footer`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ],
                    usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 }
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        // Token stats should appear in the footer
        const token_text = page.locator( `footer` ).getByText( /tokens/ )
        await expect( token_text ).toBeVisible( { timeout: 30_000 } )

        // Should contain a cost estimate
        const footer_text = await page.locator( `footer` ).textContent()
        expect( footer_text ).toMatch( /\$/ )
    } )

    test( `BW207 token usage persists across chapter navigation`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const sentence = user_msg.match( /Translate this sentence:\n(.+)/s )?.[1]?.trim() || ``

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( {
                    choices: [ { message: { content: `[TR] ${ sentence }` } } ],
                    usage: { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 }
                } )
            } )
        } )

        await mock_auth( page )
        await open_seeded_reader( page )

        // Get initial token display
        const token_el = page.locator( `footer` ).getByText( /tokens/ )
        await expect( token_el ).toBeVisible( { timeout: 30_000 } )

        // Navigate to next chapter
        const first_sentence = page.locator( `span[data-sentence-id]` ).first()
        const first_id = await first_sentence.getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await expect( first_sentence ).not.toHaveAttribute( `data-sentence-id`, first_id )

        // Token count should still be visible (and potentially higher)
        await expect( page.locator( `footer` ).getByText( /tokens/ ) ).toBeVisible( { timeout: 5000 } )
    } )

} )
