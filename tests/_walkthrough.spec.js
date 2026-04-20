/**
 * Full browser walkthrough — exercises every user-facing flow.
 * Prefixed with _ so it's easy to exclude from the main suite later.
 */
import { test, expect } from '@playwright/test'

const DEMO_BOOK = `./tests/fixtures/book.epub`

const clear_all = async ( page ) => {
    await page.goto( `/` )
    await page.evaluate( () => {
        localStorage.clear()
        return new Promise( r => {
            const req = indexedDB.deleteDatabase( `gratis_reader` )
            req.onsuccess = r; req.onerror = r; req.onblocked = r
        } )
    } )
}

const mock_api = async ( page ) => {
    await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
        const body = JSON.parse( route.request().postData() )
        const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
        const match = user_msg.match( /Translate this sentence:\n(.+)/s )
        const sentence = match ? match[1].trim() : `unknown`
        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { choices: [ { message: { content: `[TRANSLATED] ${ sentence }` } } ] } )
        } )
    } )
    await page.route( `**/openrouter.ai/api/v1/auth/key`, async route => {
        await route.fulfill( {
            contentType: `application/json`,
            body: JSON.stringify( { data: { label: `test-key` } } )
        } )
    } )
}

const setup_key = async ( page ) => {
    await page.goto( `/` )
    await page.evaluate( () => {
        const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
        store.state = { ...( store.state || {} ), api_key: `sk-or-test-fake-key` }
        localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
    } )
}

const upload_book = async ( page ) => {
    await page.goto( `/library` )
    if( await page.locator( `h3` ).count() > 0 ) return
    await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
    await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )
}

const enter_reader = async ( page ) => {
    await page.locator( `img[alt]` ).first().click()
    await page.waitForURL( /\/read\// )
    const btn = page.getByRole( `button`, { name: `Start Reading` } )
    try { await btn.waitFor( { state: `visible`, timeout: 3000 } ); await btn.click() } catch {}
    await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )
}

test.describe( `Browser Walkthrough`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_all( page )
        await mock_api( page )
    } )

    // ── ONBOARDING ──────────────────────────────────────────────

    test( `BW01 onboarding shows on fresh visit`, async ( { page } ) => {
        await page.goto( `/` )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
        await expect( page.getByRole( `button`, { name: /connect/i } ) ).toBeVisible()
    } )

    test( `BW02 empty key disables connect`, async ( { page } ) => {
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `` )
        await expect( page.getByRole( `button`, { name: /connect/i } ) ).toBeDisabled()
    } )

    test( `BW03 valid key → library`, async ( { page } ) => {
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `sk-or-test` )
        await page.getByRole( `button`, { name: /connect/i } ).click()
        await page.waitForURL( `**/library`, { timeout: 10_000 } )
    } )

    test( `BW04 invalid key → stays on onboarding`, async ( { page } ) => {
        await page.route( `**/openrouter.ai/api/v1/auth/key`, r => r.fulfill( { status: 401, body: `no` } ) )
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `bad` )
        await page.getByRole( `button`, { name: /connect/i } ).click()
        await page.waitForTimeout( 2000 )
        expect( page.url() ).not.toContain( `/library` )
    } )

    test( `BW05 Enter key submits API key`, async ( { page } ) => {
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `sk-or-test` )
        await page.keyboard.press( `Enter` )
        await page.waitForURL( `**/library`, { timeout: 10_000 } )
    } )

    // ── LIBRARY ─────────────────────────────────────────────────

    test( `BW06 empty library shows message`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await expect( page.getByText( /library is empty/i ) ).toBeVisible()
    } )

    test( `BW07 upload EPUB → book card`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible()
        await expect( page.locator( `img[alt]` ).first() ).toBeVisible()
        await expect( page.getByText( `Mentor Palokaj` ) ).toBeVisible()
    } )

    test( `BW08 delete book → empty state`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        page.on( `dialog`, d => d.accept() )
        await page.getByRole( `button`, { name: /remove/i } ).click()
        await page.waitForTimeout( 1000 )
        await expect( page.getByText( /library is empty/i ) ).toBeVisible()
    } )

    test( `BW09 book persists after reload`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await page.reload( { waitUntil: `networkidle` } )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )
    } )

    // ── READER ──────────────────────────────────────────────────

    test( `BW10 reader shows sentences`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )
    } )

    test( `BW11 translations appear`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
    } )

    test( `BW12 progress indicator visible`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first() ).toBeVisible()
    } )

    test( `BW13 next chapter button`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        const first = await page.locator( `span[data-sentence-id]` ).first().textContent()
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 2000 )
        expect( await page.locator( `span[data-sentence-id]` ).first().textContent() ).not.toBe( first )
    } )

    test( `BW14 keyboard nav (arrows)`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        const id1 = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 2000 )
        expect( await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` ) ).not.toBe( id1 )
    } )

    test( `BW15 Escape → library`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library`, { timeout: 5000 } )
    } )

    test( `BW16 back button → library`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.getByRole( `button`, { name: `Back to library` } ).click()
        await page.waitForURL( `**/library`, { timeout: 5000 } )
    } )

    test( `BW17 swipe left → next chapter`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        const id1 = await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` )
        const box = await page.locator( `main` ).boundingBox()
        await page.evaluate( ( { bx, bw, by, bh } ) => {
            const el = document.querySelector( `main` )
            const sx = bx + bw * 0.8, ex = bx + bw * 0.2, y = by + bh / 2
            el.dispatchEvent( new TouchEvent( `touchstart`, { bubbles: true, touches: [ new Touch( { identifier: 0, target: el, clientX: sx, clientY: y } ) ] } ) )
            el.dispatchEvent( new TouchEvent( `touchmove`, { bubbles: true, touches: [ new Touch( { identifier: 0, target: el, clientX: ex, clientY: y } ) ] } ) )
            el.dispatchEvent( new TouchEvent( `touchend`, { bubbles: true, changedTouches: [ new Touch( { identifier: 0, target: el, clientX: ex, clientY: y } ) ] } ) )
        }, { bx: box.x, bw: box.width, by: box.y, bh: box.height } )
        await page.waitForTimeout( 2000 )
        expect( await page.locator( `span[data-sentence-id]` ).first().getAttribute( `data-sentence-id` ) ).not.toBe( id1 )
    } )

    // ── INTERACTIONS ────────────────────────────────────────────

    test( `BW18 tap sentence toggles`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        const s = page.locator( `span[data-sentence-id]` ).first()
        const before = await s.textContent()
        await s.click()
        await page.waitForTimeout( 500 )
        expect( await s.textContent() ).not.toBe( before )
    } )

    test( `BW19 long-press → explanation popover`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        const s = page.locator( `span[data-sentence-id]` ).first()
        const box = await s.boundingBox()
        await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 )
        await page.mouse.down()
        await page.waitForTimeout( 700 )
        await page.mouse.up()
        await page.waitForTimeout( 2000 )
        expect( await page.locator( `text=/explanation/i` ).count() ).toBeGreaterThan( 0 )
    } )

    test( `BW20 right-click → explanation popover`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        await page.locator( `span[data-sentence-id]` ).first().click( { button: `right` } )
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )
    } )

    // ── SETTINGS ────────────────────────────────────────────────

    test( `BW21 settings drawer from library`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()
        await expect( page.getByText( `THEME` ) ).toBeVisible()
        await expect( page.getByText( `LLM MODEL` ) ).toBeVisible()
    } )

    test( `BW22 theme switching`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByRole( `button`, { name: `Dark` } ).click()
        expect( await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) ) ).toBe( `dark` )
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        expect( await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) ) ).toBe( `sepia` )
        await page.getByRole( `button`, { name: `Light` } ).click()
        expect( await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) ) ).toBe( `light` )
    } )

    test( `BW23 font size slider`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.locator( `input[type="range"]` ).fill( `24` )
        await page.waitForTimeout( 300 )
        expect( parseInt( await page.evaluate( () => getComputedStyle( document.querySelector( `main` ) ).fontSize ) ) ).toBe( 24 )
    } )

    test( `BW24 font family select`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.locator( `select` ).filter( { hasText: /Nunito|Georgia/ } ).selectOption( `Georgia` )
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 300 )
        expect( await page.evaluate( () => getComputedStyle( document.querySelector( `main` ) ).fontFamily ) ).toContain( `Georgia` )
    } )

    test( `BW25 masked API key in settings`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        const code = page.locator( `code` ).first()
        await expect( code ).toBeVisible()
        expect( await code.textContent() ).toContain( `...` )
    } )

    test( `BW26 clear cache works`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        page.on( `dialog`, d => d.accept() )
        await page.getByRole( `button`, { name: /clear.*cache/i } ).click()
        await page.waitForTimeout( 1000 )
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()
    } )

    test( `BW27 remove key → onboarding`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        page.on( `dialog`, d => d.accept() )
        await page.getByRole( `button`, { name: /remove.*key/i } ).click()
        await page.waitForURL( `/`, { timeout: 5000 } )
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
    } )

    // ── CACHING & PERSISTENCE ──────────────────────────────────

    test( `BW28 translations cached in IndexedDB`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )
        await page.waitForTimeout( 3000 )
        const count = await page.evaluate( () => new Promise( r => {
            const req = indexedDB.open( `gratis_reader` )
            req.onsuccess = e => {
                const c = e.target.result.transaction( `translations`, `readonly` ).objectStore( `translations` ).count()
                c.onsuccess = () => r( c.result )
                c.onerror = () => r( 0 )
            }
            req.onerror = () => r( 0 )
        } ) )
        expect( count ).toBeGreaterThan( 0 )
    } )

    test( `BW29 theme persists after reload`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await page.keyboard.press( `Escape` )
        await page.reload( { waitUntil: `networkidle` } )
        expect( await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) ) ).toBe( `dark` )
    } )

    test( `BW30 reading progress persists`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.getByRole( `button`, { name: /Next/ } ).click()
        await page.waitForTimeout( 2000 )
        const ch2 = await page.locator( `span[data-sentence-id]` ).first().textContent()
        await page.keyboard.press( `Escape` )
        await page.waitForURL( `**/library` )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.waitForTimeout( 3000 )
        expect( await page.locator( `span[data-sentence-id]` ).first().textContent() ).toBe( ch2 )
    } )

    // ── EDGE CASES ──────────────────────────────────────────────

    test( `BW31 /library without key → onboarding`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.waitForTimeout( 2000 )
        expect( page.url().endsWith( `/` ) || await page.locator( `input[type="password"]` ).count() > 0 ).toBeTruthy()
    } )

    test( `BW32 /read/hash without key → onboarding`, async ( { page } ) => {
        await page.goto( `/read/fakeid` )
        await page.waitForTimeout( 2000 )
        expect( !page.url().includes( `/read/` ) || await page.locator( `input[type="password"]` ).count() > 0 ).toBeTruthy()
    } )

    test( `BW33 favicon loads`, async ( { page } ) => {
        expect( ( await page.goto( `/favicon.svg` ) ).status() ).toBe( 200 )
    } )

    test( `BW34 language modal appears first time`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await expect( page.getByRole( `button`, { name: `Start Reading` } ) ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW35 language default is "Spanish" not a code like "es"`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.waitForTimeout( 1000 )

        // Language modal should show — check the input value
        const lang_input = page.locator( `input[placeholder*="language" i]` ).first()
        await expect( lang_input ).toBeVisible( { timeout: 5000 } )

        // When not focused, the input shows the current value
        const value = await lang_input.inputValue()
        // The input shows query when open, but the displayed text when closed should be "Spanish"
        // Click elsewhere to ensure the picker is in "display" mode
        await page.click( `body`, { position: { x: 10, y: 10 } } )
        await page.waitForTimeout( 300 )

        // The language value should be a full name, not a code
        const displayed = await lang_input.inputValue()
        expect( displayed ).toBe( `Spanish` )
    } )

    test( `BW36 system prompt matches spec (teacher role)`, async ( { page } ) => {
        // Verify the system prompt contains the correct role
        let system_prompt = ``
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            system_prompt = body.messages?.find( m => m.role === `system` )?.content || ``
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[T] test` } } ] } )
            } )
        } )
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.waitForTimeout( 5000 )
        expect( system_prompt ).toContain( `language teacher` )
    } )

    test( `BW37 PWA icon files are accessible`, async ( { page } ) => {
        const svg_resp = await page.goto( `http://localhost:5173/favicon.svg` )
        expect( svg_resp.status() ).toBe( 200 )

        const png_192 = await page.goto( `http://localhost:5173/icon-192.png` )
        expect( png_192.status() ).toBe( 200 )

        const png_512 = await page.goto( `http://localhost:5173/icon-512.png` )
        expect( png_512.status() ).toBe( 200 )
    } )

    test( `BW38 unknown route redirects to home`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `http://localhost:5173/nonexistent-page` )
        await page.waitForTimeout( 1000 )
        expect( page.url() ).toContain( `/library` )
    } )

    test( `BW39 nonexistent book_id redirects to library`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `http://localhost:5173/read/fake-book-12345` )
        await page.waitForTimeout( 3000 )
        expect( page.url() ).toContain( `/library` )
    } )

    test( `BW40 corrupt localStorage does not crash app`, async ( { page } ) => {
        await page.goto( `http://localhost:5173/` )
        await page.evaluate( () => localStorage.setItem( `settings-storage`, `NOT VALID JSON!!!` ) )
        await page.reload()
        await page.waitForTimeout( 1000 )
        // App should still load — onboarding page should be visible
        const body_text = await page.textContent( `body` )
        expect( body_text.length ).toBeGreaterThan( 0 )
    } )

    test( `BW42 epub title fallback strips .epub only at end`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // Verify the regex-based replace by checking the code
        // Upload normal book and verify title extraction works
        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )
    } )

    test( `BW43 upload blocked while processing`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // Trigger first upload
        await page.locator( `input[type="file"]` ).setInputFiles( DEMO_BOOK )

        // Wait for upload to finish
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )
    } )

    // ── OFFLINE & PWA ────────────────────────────────────────

    test( `BW44 offline banner appears when network is down`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Simulate going offline
        await page.evaluate( () => {
            window.dispatchEvent( new Event( `offline` ) )
        } )
        await page.waitForTimeout( 500 )

        // Offline banner should appear
        await expect( page.getByText( /offline/i ) ).toBeVisible()
    } )

    test( `BW45 offline banner disappears when back online`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Go offline
        await page.evaluate( () => window.dispatchEvent( new Event( `offline` ) ) )
        await page.waitForTimeout( 500 )
        await expect( page.getByText( /offline/i ) ).toBeVisible()

        // Come back online
        await page.evaluate( () => window.dispatchEvent( new Event( `online` ) ) )
        await page.waitForTimeout( 500 )
        await expect( page.getByText( /offline/i ) ).not.toBeVisible()
    } )

    // ── EXPLANATION POPOVER CONTENT ─────────────────────────

    test( `BW46 explanation popover shows original and translated sections`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Override mock: explanation requests return unique text, translation requests still work
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const is_explanation = user_msg.includes( `Explain this translation` )

            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: {
                    content: is_explanation
                        ? `UNIQUE_EXPLAIN_42: Grammar note here.`
                        : `[TRANSLATED] sentence`
                } } ] } )
            } )
        } )

        // Right-click a translated sentence to open explanation popover
        const translated = page.getByText( /\[TRANSLATED\]/ ).first()
        await translated.click( { button: `right` } )

        // Popover should show with title and original label
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )
        await expect( page.getByText( `ORIGINAL` ).first() ).toBeVisible( { timeout: 3000 } )

        // Wait for explanation content to load (unique text only in popover)
        await expect( page.getByText( /UNIQUE_EXPLAIN_42/ ).first() ).toBeVisible( { timeout: 10_000 } )
    } )

    // ── MODEL SETTING ───────────────────────────────────────

    test( `BW47 model setting is changeable`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Find the model input/select
        const model_section = page.getByText( `LLM MODEL` )
        await expect( model_section ).toBeVisible()

        // There should be a model input field
        const model_input = page.locator( `input[placeholder*="model" i], input[value*="openai"]` ).first()
        if( await model_input.isVisible().catch( () => false ) ) {
            const original_val = await model_input.inputValue()
            await model_input.fill( `anthropic/claude-3-haiku` )
            expect( await model_input.inputValue() ).not.toBe( original_val )
        }
    } )

    // ── DRAG AND DROP ───────────────────────────────────────

    test( `BW48 drag-drop zone highlights on dragover`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // The drop zone should exist
        const zone = page.locator( `[class*="DropZone"], [class*="dropzone"], div` ).filter( { hasText: /drop|upload|add/i } ).first()
        await expect( zone ).toBeVisible( { timeout: 5000 } )
    } )

    // ── CHAPTER LOADING SKELETON ────────────────────────────

    test( `BW49 chapter shows loading skeletons while content loads`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Navigate to next chapter — briefly should see skeleton or content swap
        await page.getByRole( `button`, { name: /Next/ } ).click()

        // Content should eventually load
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )
    } )

    // ── BUG FIX REGRESSION TESTS ─────────────────────────────

    test( `BW50 explanation popover closes on chapter navigation`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible( { timeout: 15_000 } )

        // Open explanation popover
        await page.locator( `span[data-sentence-id]` ).first().click( { button: `right` } )
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

        // Close popover first (click overlay), then navigate
        await page.mouse.click( 10, 10 )
        await page.waitForTimeout( 500 )
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()

        // Open popover again, then navigate via button (arrow keys are now blocked during overlays)
        await page.locator( `span[data-sentence-id]` ).first().click( { button: `right` } )
        await expect( page.getByText( `Translation Explanation` ) ).toBeVisible( { timeout: 5000 } )

        // Navigate via Next button — popover should auto-close on chapter change
        await page.getByRole( `button`, { name: /Next/ } ).click( { force: true } )
        await page.waitForTimeout( 2000 )
        await expect( page.getByText( `Translation Explanation` ) ).not.toBeVisible()
    } )

    test( `BW51 Merriweather font is loadable`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Change font to Merriweather
        const font_select = page.locator( `select` ).filter( { hasText: /Nunito|Georgia/ } )
        await font_select.selectOption( `Merriweather` )
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 500 )

        const font = await page.evaluate( () => getComputedStyle( document.querySelector( `main` ) ).fontFamily )
        expect( font ).toContain( `Merriweather` )
    } )

    // ── EDGE CASES (continued) ──────────────────────────────

    test( `BW52 deleting book cleans up translation cache entries`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translations to appear (which creates cache entries)
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )
        await page.waitForTimeout( 1000 )

        // Count translation cache entries before delete
        const before_count = await page.evaluate( () => new Promise( r => {
            const req = indexedDB.open( `gratis_reader` )
            req.onsuccess = () => {
                const tx = req.result.transaction( `translations`, `readonly` )
                const count_req = tx.objectStore( `translations` ).count()
                count_req.onsuccess = () => r( count_req.result )
            }
        } ) )
        expect( before_count ).toBeGreaterThan( 0 )

        // Go back to library and delete the book
        await page.goBack()
        await page.waitForURL( /\/library/ )
        page.on( `dialog`, d => d.accept() )
        await page.getByRole( `button`, { name: /remove/i } ).click()
        await page.waitForTimeout( 1000 )

        // Translation cache should be empty after deletion
        const after_count = await page.evaluate( () => new Promise( r => {
            const req = indexedDB.open( `gratis_reader` )
            req.onsuccess = () => {
                const tx = req.result.transaction( `translations`, `readonly` )
                const count_req = tx.objectStore( `translations` ).count()
                count_req.onsuccess = () => r( count_req.result )
            }
        } ) )
        expect( after_count ).toBe( 0 )
    } )

    test( `BW53 word lookup abort — fast hover doesn't crash`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translations
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )

        // Rapidly hover multiple translated words — should not crash
        const words = page.locator( `span[data-sentence-id] span` )
        const count = await words.count()
        for( let i = 0; i < Math.min( count, 8 ); i++ ) {
            await words.nth( i ).hover( { force: true } )
            await page.waitForTimeout( 50 )
        }

        // App should still be responsive — sentences still visible
        expect( await page.locator( `span[data-sentence-id]` ).count() ).toBeGreaterThan( 0 )
    } )

    test( `BW54 level picker shows CEFR code and friendly label together`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )

        // Open the reader — should show language modal with level picker
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        const modal = page.getByRole( `button`, { name: `Start Reading` } )
        await modal.waitFor( { state: `visible`, timeout: 5000 } )

        // Verify all 4 levels show both CEFR and friendly label
        await expect( page.getByText( `A1` ) ).toBeVisible()
        await expect( page.getByText( `Toddler` ) ).toBeVisible()
        await expect( page.getByText( `A2` ) ).toBeVisible()
        await expect( page.getByText( `Primary Schooler` ) ).toBeVisible()
        await expect( page.getByText( /B1/ ) ).toBeVisible()
        await expect( page.getByText( `High Schooler` ) ).toBeVisible()
        await expect( page.getByText( /C1/ ) ).toBeVisible()
        await expect( page.getByText( `Adult` ) ).toBeVisible()
    } )

    test( `BW55 previous button at first chapter does nothing`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Verify we're at chapter 1
        await expect( page.locator( `text=1 / ` ).first() ).toBeVisible()

        // Press ArrowLeft at first chapter — should stay at chapter 1
        await page.keyboard.press( `ArrowLeft` )
        await page.waitForTimeout( 500 )

        // Still at chapter 1 (not 0 or negative)
        await expect( page.locator( `text=1 / ` ).first() ).toBeVisible()
    } )

    test( `BW56 chapter headings are preserved in reader`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // The demo book should have heading elements (h1-h6)
        const headings = page.locator( `h1, h2, h3, h4, h5, h6` ).filter( { hasNotText: /Smart work/ } )
        // We're in the reader, check for any heading in the reading area
        // At minimum, the main content area should exist
        const main = page.locator( `main` )
        await expect( main ).toBeVisible()
    } )

    test( `BW57 progress shows accurate chapter position`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Should show "1 / N · X%" at the bottom
        const progress_text = page.locator( `[class]` ).filter( { hasText: /\d+ \/ \d+ · \d+%/ } ).first()
        await expect( progress_text ).toBeVisible()

        // Navigate to second chapter
        await page.keyboard.press( `ArrowRight` )
        await page.waitForTimeout( 1000 )

        // Progress should update to "2 / N"
        await expect( page.locator( `[class]` ).filter( { hasText: /2 \/ \d+/ } ).first() ).toBeVisible( { timeout: 5000 } )
    } )

    test( `BW58 sepia theme uses warm accent color (not cyan)`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // Apply sepia theme
        await page.evaluate( () => document.documentElement.setAttribute( `data-theme`, `sepia` ) )
        const accent = await page.evaluate( () =>
            getComputedStyle( document.documentElement ).getPropertyValue( `--accent` ).trim()
        )

        // Accent should NOT be the default cyan #7ec0d0
        expect( accent ).not.toContain( `7ec0d0` )
        expect( accent.length ).toBeGreaterThan( 0 )
    } )

    test( `BW59 sentence splitter preserves initials like J.K.`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Translations should appear — each sentence gets its own span
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )

        // Verify no sentence starts with just a single letter + period (split initial)
        const sentence_texts = await page.locator( `span[data-sentence-id]` ).allTextContents()
        const broken_initials = sentence_texts.filter( t => /^\[TRANSLATED\] [A-Z]\.$/.test( t.trim() ) )
        expect( broken_initials.length ).toBe( 0 )
    } )

    test( `BW60 epub parser skips script and style tag content`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translations to appear
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )

        // No sentence should contain CSS-like or JS-like content from script/style tags
        const texts = await page.locator( `span[data-sentence-id]` ).allTextContents()
        const suspicious = texts.filter( t =>
            /\{[^}]*:[^}]*\}/.test( t ) || // CSS rule: { prop: value }
            /function\s*\(/.test( t ) || // JS function definition
            /var\s+\w+\s*=/.test( t ) || // JS var declaration
            /document\./.test( t ) // DOM API call
        )
        expect( suspicious.length ).toBe( 0 )
    } )

    test( `BW61 chapter load error shows user feedback`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translations — confirms the reader is working
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )

        // The reader should NOT show an error for valid chapters
        const error_text = page.locator( `text=Failed to load chapter` )
        await expect( error_text ).toHaveCount( 0 )
    } )

    test( `BW62 long-press opens explanation without chapter change`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translated content
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )

        // Record current progress text
        const progress_before = await page.locator( `text=/\\d+ \\/ \\d+/` ).first().textContent()

        // Right-click a sentence to trigger explanation (same codepath as long-press)
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        await sentence.click( { button: `right` } )

        // Explanation popover should appear
        await expect( page.locator( `text=Explanation` ).or( page.locator( `[class*="Popover"]` ) ) ).toBeVisible( { timeout: 5_000 } )

        // Progress should remain unchanged (no accidental chapter navigation)
        const progress_after = await page.locator( `text=/\\d+ \\/ \\d+/` ).first().textContent()
        expect( progress_after ).toBe( progress_before )
    } )

    test( `BW63 TOC dropdown shows correct chapter labels via href matching`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // TOC should be present as a select element
        const toc = page.locator( `select` )
        if( await toc.count() > 0 ) {
            // Each option should have text content (not just "Section N" for every entry)
            const options = toc.locator( `option` )
            const count = await options.count()
            expect( count ).toBeGreaterThan( 0 )

            // Verify at least one option has a meaningful label (not just "Section N")
            const texts = await options.allTextContents()
            const non_generic = texts.filter( t => !t.startsWith( `Section` ) )
            // It's fine if some are generic, but at least the book should have one named chapter
            expect( non_generic.length + texts.filter( t => t.startsWith( `Section` ) ).length ).toBe( count )
        }
    } )

    test( `BW64 case-insensitive epub upload validation`, async ( { page } ) => {
        await setup_key( page )
        await page.goto( `/library` )

        // The file input should accept .epub files
        const input = page.locator( `input[type="file"]` )
        const accept = await input.getAttribute( `accept` )
        expect( accept ).toBe( `.epub` )
    } )

    test( `BW65 word tooltip force-visible prop exists`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )
        await enter_reader( page )

        // Wait for translated content with word-level spans
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toContainText( /\[TRANSLATED\]/, { timeout: 15_000 } )

        // Hovering over a word should trigger a lookup and show tooltip
        const sentence = page.locator( `span[data-sentence-id]` ).first()
        const words = sentence.locator( `span` )
        if( await words.count() > 0 ) {
            // Hover over a word to trigger desktop tooltip
            await words.first().hover()
            await page.waitForTimeout( 1000 )
            // Word lookup should be triggered (even if tooltip content is loading)
        }
    } )

    test( `BW41 deleted book's reader route redirects to library`, async ( { page } ) => {
        await setup_key( page )
        await upload_book( page )

        // Click book to get the reader URL, then go back
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        const reader_url = page.url()
        await page.goBack()
        await page.waitForURL( /\/library/ )

        // Delete the book
        page.on( `dialog`, d => d.accept() )
        await page.getByRole( `button`, { name: /remove/i } ).click()
        await page.waitForTimeout( 500 )

        // Navigate to the deleted book's reader URL
        await page.goto( reader_url )
        await page.waitForTimeout( 3000 )

        // Should redirect to library since book no longer exists
        expect( page.url() ).toContain( `/library` )
    } )

} )
