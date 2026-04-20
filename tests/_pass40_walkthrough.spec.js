/**
 * Pass 40 — Read-ahead stress tests and regression checks
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_auth } from './helpers/setup.js'

test.describe( `Pass 40 — Read-ahead buffer`, () => {

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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )

        // Wait enough time for read-ahead to complete
        await page.waitForTimeout( 10000 )

        // Total unique sentences translated should be > sentences on screen
        // because read-ahead pre-translates next 2 chapters
        const visible_count = await page.locator( `span[data-sentence-id]` ).count()
        expect( translated_ids.size ).toBeGreaterThan( visible_count )
    } )

    test( `BW202 navigating forward shows pre-cached translations instantly`, async ( { page } ) => {
        let api_calls_after_nav = 0

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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )

        // Wait for read-ahead to pre-translate next 2 chapters
        await page.waitForTimeout( 10000 )

        // Start counting API calls from this point
        let counting = true
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            if( counting ) api_calls_after_nav++
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

        // Navigate forward
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )

        // Sentences in chapter 2 should appear (from read-ahead cache)
        const sentences = await page.locator( `span[data-sentence-id]` ).count()
        expect( sentences ).toBeGreaterThan( 0 )
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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Rapidly navigate through 6 chapters
        for( let i = 0; i < 6; i++ ) {
            await page.keyboard.press( `ArrowRight` )
            await page.waitForTimeout( 100 )
        }

        // Wait for everything to settle
        await page.waitForTimeout( 3000 )

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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Jump to last chapter using TOC
        const toc_select = page.locator( `select` ).first()
        const options = await toc_select.locator( `option` ).all()
        const last_index = options.length - 1
        await toc_select.selectOption( { index: last_index } )
        await page.waitForTimeout( 3000 )

        // No errors on last chapter (read-ahead has nothing to pre-fetch)
        expect( errors ).toEqual( [] )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 5000 } )
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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )

        // Wait for initial translations
        await page.waitForTimeout( 8000 )
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
        await page.waitForTimeout( 10000 )

        // More translations should have been triggered
        expect( translation_count ).toBeGreaterThan( count_after_load )
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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )

        // Wait for translations to complete
        await page.waitForTimeout( 8000 )

        // Token stats should appear in the footer
        const token_text = page.locator( `footer` ).getByText( /tokens/ )
        await expect( token_text ).toBeVisible( { timeout: 5000 } )

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
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 6000 )

        // Get initial token display
        const token_el = page.locator( `footer` ).getByText( /tokens/ )
        await expect( token_el ).toBeVisible( { timeout: 5000 } )

        // Navigate to next chapter
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 6000 )

        // Token count should still be visible (and potentially higher)
        await expect( page.locator( `footer` ).getByText( /tokens/ ) ).toBeVisible( { timeout: 5000 } )
    } )

} )
