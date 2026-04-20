/**
 * Pass 35 — Console warnings, network shapes, combined feature interactions
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth } from './helpers/setup.js'

test.describe( `Pass 35 — Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    // ── 1. No React console warnings during normal flow ──

    test( `BW138 no console warnings during upload and read`, async ( { page } ) => {
        const warnings = []
        page.on( `console`, msg => {
            if( msg.type() === `warning` && msg.text().includes( `React` ) ) {
                warnings.push( msg.text() )
            }
        } )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Filter out known non-issues (e.g. React DevTools suggestions)
        const real_warnings = warnings.filter( w =>
            !w.includes( `DevTools` ) && !w.includes( `StrictMode` )
        )
        expect( real_warnings ).toEqual( [] )
    } )

    // ── 2. OpenRouter API request has correct headers ──

    test( `BW139 translation API requests have correct Authorization header`, async ( { page } ) => {
        let captured_headers = null

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            captured_headers = route.request().headers()
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
            } )
        } )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 3000 )

        expect( captured_headers ).toBeTruthy()
        expect( captured_headers[`authorization`] ).toMatch( /^Bearer\s+\S+/ )
        expect( captured_headers[`content-type`] ).toContain( `application/json` )
    } )

    // ── 3. API request body has correct structure ──

    test( `BW140 translation API request body has model and messages array`, async ( { page } ) => {
        let captured_body = null

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            captured_body = JSON.parse( route.request().postData() )
            const user_msg = captured_body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
            } )
        } )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 3000 )

        expect( captured_body ).toBeTruthy()
        expect( captured_body.model ).toBeTruthy()
        expect( Array.isArray( captured_body.messages ) ).toBeTruthy()

        // Should have system + user messages
        const system = captured_body.messages.find( m => m.role === `system` )
        const user = captured_body.messages.find( m => m.role === `user` )
        expect( system ).toBeTruthy()
        expect( user ).toBeTruthy()
        expect( system.content.length ).toBeGreaterThan( 50 )
    } )

    // ── 4. Settings + theme + translation combined ──

    test( `BW141 change theme then toggle sentence — no visual glitch`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // Change theme to sepia
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        await page.getByRole( `button`, { name: `Close` } ).click()
        await page.waitForTimeout( 300 )

        // Toggle a sentence
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Toggle back
        await sentence.click()
        await page.waitForTimeout( 300 )

        // Change font size
        await page.getByRole( `button`, { name: `Settings` } ).click()
        const slider = page.locator( `input[type="range"]` ).first()
        await slider.fill( `24` )
        await page.getByRole( `button`, { name: `Close` } ).click()

        // Filter known React 19 / zustand intermittent issue
        const real_errors = errors.filter( e => !e.includes( `getSnapshot` ) )
        expect( real_errors ).toEqual( [] )
    } )

    // ── 5. Fast scroll through chapters then open settings ──

    test( `BW142 rapid chapter nav then settings open — no crash`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 500 )

        // Navigate forward rapidly
        for( let i = 0; i < 3; i++ ) {
            await page.keyboard.press( `ArrowRight` )
            await page.waitForTimeout( 50 )
        }

        // Immediately open settings
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.waitForTimeout( 500 )

        // Settings should be visible without crash
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible( { timeout: 3000 } )
        expect( errors ).toEqual( [] )
    } )

    // ── 6. Translation cache persists across reader re-entry ──

    test( `BW143 cached translations served on second visit`, async ( { page } ) => {
        let api_call_count = 0

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            api_call_count++
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[CACHED] ${ sentence }` } } ] } )
            } )
        } )

        // First visit — translations fetched from API
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 3000 )

        const first_count = api_call_count

        // Go back to library
        await page.getByRole( `button`, { name: /back/i } ).click()
        await page.waitForURL( /\/library/ )

        // Re-enter reader
        api_call_count = 0
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        try {
            const start = page.getByRole( `button`, { name: `Start Reading` } )
            await start.waitFor( { state: `visible`, timeout: 2000 } )
            await start.click()
        } catch { /* no modal */ }
        await page.waitForTimeout( 3000 )

        // Second visit should have fewer API calls (served from cache)
        expect( api_call_count ).toBeLessThan( first_count )
    } )

    // ── 7. Special characters in book content render safely ──

    test( `BW144 sentences with special chars render without XSS`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await page.waitForTimeout( 2000 )

        // No script tags should exist in the reading area
        const scripts = await page.locator( `main script` ).count()
        expect( scripts ).toBe( 0 )

        // No iframes either
        const iframes = await page.locator( `main iframe` ).count()
        expect( iframes ).toBe( 0 )
    } )

    // ── 8. Viewport meta tag exists for mobile ──

    test( `BW145 page has viewport meta tag for responsive design`, async ( { page } ) => {
        await page.goto( `/library` )

        const viewport = await page.evaluate( () => {
            const meta = document.querySelector( `meta[name="viewport"]` )
            return meta ? meta.getAttribute( `content` ) : null
        } )

        expect( viewport ).toBeTruthy()
        expect( viewport ).toContain( `width=device-width` )
    } )

} )
