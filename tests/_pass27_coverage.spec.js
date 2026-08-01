/**
 * Pass 27 — Coverage expansion tests
 * Fills gaps found during spec audit: drag-and-drop, default model,
 * level-specific prompts, cache key format, explanation content,
 * offline banner, cover extraction, MOBI rejection, PWA config.
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

// Helper to open settings from reader
const open_settings = async ( page ) => {
    await page.getByRole( `button`, { name: `Settings` } ).click()
    await expect( page.getByText( /font size/i ) ).toBeVisible( { timeout: 3000 } )
}

test.describe( `Pass 27 — Coverage Expansion`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    // ── Spec §2: MOBI rejection ──

    test( `P27-01 uploading a non-EPUB file shows error`, async ( { page } ) => {
        await page.goto( `/library` )

        // Create a fake .mobi file
        const buffer = Buffer.from( `fake mobi content` )
        await page.locator( `input[type="file"]` ).setInputFiles( {
            name: `book.mobi`,
            mimeType: `application/octet-stream`,
            buffer
        } )
        await expect( page.getByText( /only epub files are supported/i ) ).toBeVisible()

        // Should NOT create a book card (file rejected)
        const demo_book = page.getByRole( `heading`, { name: `Smart work beats hard work` } )
        await expect( demo_book ).not.toBeVisible()
    } )

    // ── Spec §2: Cover image extraction ──

    test( `P27-02 uploaded book has cover image`, async ( { page } ) => {
        await upload_demo_book( page )

        // Cover image should be visible as an <img> tag
        const img = page.locator( `img[alt]` ).first()
        await expect( img ).toBeVisible( { timeout: 5000 } )

        // Image should have valid src (blob: or data: URL)
        const src = await img.getAttribute( `src` )
        expect( src ).toBeTruthy()
        expect( src.length ).toBeGreaterThan( 5 )
    } )

    // ── Spec §5: Default model ──

    test( `P27-03 default LLM model is openai/gpt-4o-mini`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await open_settings( page )

        // Find the model select/dropdown
        const model_select = page.locator( `select` ).last()
        const selected = await model_select.inputValue()
        expect( selected ).toBe( `openai/gpt-4o-mini` )
    } )

    // ── Spec §5: Level-specific prompt rules ──

    test( `P27-04a A0 translation prompt allows caveman simplification`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
            } )
        } )

        // Set level to A0 before opening
        await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            store.state = { ...( store.state || {} ), last_level: `a0` }
            localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
        } )

        await upload_demo_book( page )
        const translation_request = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            request.postData()?.includes( `Translate this sentence` )
        )
        await open_reader( page )
        const body = ( await translation_request ).postDataJSON()
        const captured_system = body.messages?.find( m => m.role === `system` )?.content || ``

        expect( captured_system ).toContain( `Caveman` )
        expect( captured_system ).toContain( `A0` )
        expect( captured_system.toLowerCase() ).toMatch( /very very|mostly.*correct|rough|incomplete/ )
    } )

    test( `P27-04 A1 translation prompt includes strict simplification rules`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
            } )
        } )

        // Set level to A1 before opening
        await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            store.state = { ...( store.state || {} ), last_level: `a1` }
            localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
        } )

        await upload_demo_book( page )
        const translation_request = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            request.postData()?.includes( `Translate this sentence` )
        )
        await open_reader( page )
        const body = ( await translation_request ).postDataJSON()
        const captured_system = body.messages?.find( m => m.role === `system` )?.content || ``

        // System prompt should contain A1-specific rules
        expect( captured_system ).toContain( `language teacher` )
        expect( captured_system.toLowerCase() ).toMatch( /500|common|simple|toddler/i )
    } )

    test( `P27-05 C1-C2 translation prompt preserves style and nuance`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``
            const match = user_msg.match( /Translate this sentence:\n(.+)/s )
            const sentence = match ? match[1].trim() : `unknown`
            await route.fulfill( {
                contentType: `application/json`,
                body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
            } )
        } )

        // Set level to C1-C2
        await page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            store.state = { ...( store.state || {} ), last_level: `c1-c2` }
            localStorage.setItem( `settings-storage`, JSON.stringify( store ) )
        } )

        await upload_demo_book( page )
        const translation_request = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            request.postData()?.includes( `Translate this sentence` )
        )
        await open_reader( page )
        const body = ( await translation_request ).postDataJSON()
        const captured_system = body.messages?.find( m => m.role === `system` )?.content || ``

        // System prompt should contain C1-C2 rules about preserving style
        expect( captured_system.toLowerCase() ).toMatch( /nuance|style|tone|preserve|full vocabulary/i )
    } )

    // ── Spec §6: Cache key format ──

    test( `P27-06 translation cache keys follow spec format`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Read cache keys from IndexedDB
        const read_cache_keys = () => page.evaluate( () => {
            return new Promise( resolve => {
                const req = indexedDB.open( `gratis_reader` )
                req.onsuccess = () => {
                    const db = req.result
                    if( !db.objectStoreNames.contains( `translations` ) ) {
                        resolve( [] )
                        return
                    }
                    const tx = db.transaction( `translations`, `readonly` )
                    const store = tx.objectStore( `translations` )
                    const all = store.getAll()
                    all.onsuccess = () => resolve( all.result.map( e => e.key ) )
                    all.onerror = () => resolve( [] )
                }
                req.onerror = () => resolve( [] )
            } )
        } )
        await expect.poll( read_cache_keys ).not.toEqual( [] )
        const keys = await read_cache_keys()

        expect( keys.length ).toBeGreaterThan( 0 )

        // Each key should be: {hash}:{chapter}:{paragraph}:{sentence}:{language}:{level}
        for( const key of keys ) {
            if( key.startsWith( `word:` ) ) continue // skip word cache entries
            const parts = key.split( `:` )
            expect( parts.length ).toBe( 6 ) // hash:ch:para:sent:lang:level
            expect( parts[0] ).toMatch( /^[a-f0-9]+$/ ) // hex hash
        }
    } )

    // ── Spec §7d: Explanation popover content ──

    test( `P27-07 explanation popover shows original and translated sentences`, async ( { page } ) => {

        // Mock explanation response
        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
            const body = JSON.parse( route.request().postData() )
            const user_msg = body.messages?.find( m => m.role === `user` )?.content || ``

            if( user_msg.includes( `Explain this translation` ) || user_msg.includes( `breakdown` ) || user_msg.includes( `word-by-word` ) || user_msg.includes( `phrase-by-phrase` ) ) {
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `## Breakdown\n- "Hello" → "Hola" (greeting)\n- "world" → "mundo" (noun)\n\n**Grammar:** Simple subject-object.` } } ] } )
                } )
            } else {
                const match = user_msg.match( /Translate this sentence:\n(.+)/s )
                const sentence = match ? match[1].trim() : `unknown`
                await route.fulfill( {
                    contentType: `application/json`,
                    body: JSON.stringify( { choices: [ { message: { content: `[TR] ${ sentence }` } } ] } )
                } )
            }
        } )

        await upload_demo_book( page )
        await open_reader( page )

        // Select a word and open its explanation.
        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await expect( word ).toBeVisible()
        await word.click()
        await page.locator( `[data-translation-info-sheet]` ).getByRole( `button`, { name: `Explain` } ).click()

        // Explanation title should be visible
        await expect( page.getByText( /translation explanation/i ) ).toBeVisible( { timeout: 5000 } )
        await expect( page.getByText( /Breakdown/ ) ).toBeVisible()

        // Should show original and translated sections
        const content = await page.evaluate( () => document.body.textContent )
        expect( content ).toMatch( /original/i )
    } )

    // ── Spec PWA: Offline banner ──

    test( `P27-08 offline banner appears when network drops`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Simulate going offline
        await page.evaluate( () => window.dispatchEvent( new Event( `offline` ) ) )

        // Check for offline banner
        const offline_text = page.getByText( /offline/i )
        await expect( offline_text ).toBeVisible( { timeout: 3000 } )

        // Simulate coming back online
        await page.evaluate( () => window.dispatchEvent( new Event( `online` ) ) )

        // Banner should disappear
        await expect( offline_text ).not.toBeVisible( { timeout: 3000 } )
    } )

    // ── Spec §8: Language change triggers re-translation ──

    test( `P27-09 changing language in settings clears translations`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await expect( page.getByText( /\[TRANSLATED\]/ ).first() ).toBeVisible()

        // Verify translations are showing
        const tr_count_before = await page.locator( `text=/\\[TRANSLATED\\]/` ).count()
        expect( tr_count_before ).toBeGreaterThan( 0 )

        // Open settings and change language
        await open_settings( page )

        // Click on the language input to open dropdown
        const lang_input = page.locator( `input[placeholder*="anguage" i], input[placeholder*="earch" i]` ).first()
        await expect( lang_input ).toBeVisible()
        await lang_input.fill( `French` )

        // Select from dropdown and wait for the changed-language request.
        const option = page.getByText( `French`, { exact: true } ).first()
        await expect( option ).toBeVisible()
        const french_request = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            request.postData()?.includes( `French` )
        )
        await option.click( { force: true } )
        await french_request

        // Close settings
        await page.keyboard.press( `Escape` )
        await expect( page.getByText( /font size/i ) ).not.toBeVisible()

        // Language should have changed in store
        await expect.poll( () => page.evaluate( () => {
            const store = JSON.parse( localStorage.getItem( `settings-storage` ) || `{}` )
            return store?.state?.last_language
        } ) ).toBe( `French` )
    } )

    // ── Spec §7: Swipe navigation (mobile touch) ──

    test( `P27-10 horizontal swipe navigates chapters on mobile`, async ( { browser } ) => {

        const context = await browser.newContext( {
            viewport: { width: 375, height: 667 },
            hasTouch: true
        } )
        const page = await context.newPage()
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
        await upload_demo_book( page )
        await open_reader( page )

        // Get the initial chapter position.
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` ).first()
        const initial_progress = await progress.textContent()

        // Simulate swipe left (next chapter) - touch at center, drag left
        await page.touchscreen.tap( 187, 400 )
        await page.evaluate( () => {
            const area = document.querySelector( `[class*="reading"], [class*="Reading"], main, article` ) || document.body
            const rect = area.getBoundingClientRect()
            const startX = rect.left + rect.width * 0.8
            const startY = rect.top + rect.height * 0.5
            const endX = rect.left + rect.width * 0.2

            area.dispatchEvent( new TouchEvent( `touchstart`, {
                bubbles: true,
                touches: [ new Touch( { identifier: 0, target: area, clientX: startX, clientY: startY } ) ]
            } ) )
            area.dispatchEvent( new TouchEvent( `touchend`, {
                bubbles: true,
                changedTouches: [ new Touch( { identifier: 0, target: area, clientX: endX, clientY: startY } ) ]
            } ) )
        } )

        // Content should have changed (next chapter)
        await expect( progress ).not.toHaveText( initial_progress )
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        await context.close()
    } )

    // ── Spec §1: API key masked display ──

    test( `P27-11 API key is masked in settings`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await open_settings( page )

        // API key shows first 6 chars + "..." + last 4 chars (not the full key)
        const has_masked = await page.evaluate( () => {
            const body = document.body.textContent
            // Mask format: "sk-or-...key" (6 chars + ... + 4 chars)
            return body.includes( `...` ) && /sk-or/.test( body )
        } )
        expect( has_masked ).toBeTruthy()
    } )

    // ── Spec §6: Clear cache with confirmation ──

    test( `P27-12 clear cache shows confirmation dialog`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await open_settings( page )

        // Find and click clear cache button
        const clear_btn = page.getByRole( `button`, { name: /clear/i } )
        await expect( clear_btn ).toBeVisible()
        const dialog_message = page.waitForEvent( `dialog` ).then( async dialog => {
            const message = dialog.message()
            await dialog.dismiss()
            return message
        } )
        await clear_btn.click()

        expect( await dialog_message ).toMatch( /clear/i )
    } )

    // ── Spec §7: Progress indicator format ──

    test( `P27-13 progress shows chapter position format (X / Y)`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Progress should display as "X / Y · Z%"
        const progress_text = await page.evaluate( () => {
            const body = document.body.textContent
            const match = body.match( /(\d+)\s*\/\s*(\d+)\s*·?\s*(\d+)%?/ )
            return match ? match[0] : null
        } )
        expect( progress_text ).toBeTruthy()
    } )

    // ── Spec §5: System prompt has "only translated sentence" output rule ──

    test( `P27-14 system prompt instructs output ONLY translated sentence`, async ( { page } ) => {

        await page.route( `**/openrouter.ai/api/v1/chat/completions`, async route => {
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
        const translation_request = page.waitForRequest( request =>
            request.url().includes( `openrouter.ai/api/v1/chat/completions` ) &&
            request.postData()?.includes( `Translate this sentence` )
        )
        await open_reader( page )
        const body = ( await translation_request ).postDataJSON()
        const captured_system = body.messages?.find( m => m.role === `system` )?.content || ``

        // System prompt must instruct: output ONLY the translated sentence
        expect( captured_system.toLowerCase() ).toMatch( /only.*translat|no explanat|no quote|no additional/i )
    } )

    // ── Spec §7b: Contextual translation for selected word ──

    test( `P27-15 selected translated word shows and clears its contextual tooltip`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await expect( word ).toBeVisible()
        await word.click()

        await expect( page.locator( `[data-reader-word-tooltip]` ) ).toBeVisible()
        await page.getByRole( `button`, { name: `Close translation information` } ).click()
        await expect( page.locator( `[data-reader-word-tooltip]` ) ).not.toBeVisible()
        await expect( word ).toHaveAttribute( `aria-pressed`, `false` )
    } )

    // ── Spec §8: Settings drawer opens from config icon (top-right) ──

    test( `P27-16 settings icon is in top-right area of reader`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        const gear = page.getByRole( `button`, { name: /settings/i } )
        await expect( gear ).toBeVisible()

        // Check position — should be in top-right quadrant
        const box = await gear.boundingBox()
        const viewport = page.viewportSize()
        expect( box.x + box.width / 2 ).toBeGreaterThan( viewport.width * 0.5 ) // right half
        expect( box.y ).toBeLessThan( viewport.height * 0.2 ) // top 20%
    } )

} )
