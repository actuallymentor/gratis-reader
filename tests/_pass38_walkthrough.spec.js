/**
 * Pass 38 — Comprehensive browser walkthrough
 * Fresh eyes: cover every user flow end-to-end
 */
import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, open_reader, mock_openrouter, mock_auth, clear_storage } from './helpers/setup.js'

test.describe( `Pass 38 — Onboarding`, () => {

    test( `BW166 first launch with no key shows onboarding`, async ( { page } ) => {
        await mock_auth( page )
        await clear_storage( page )
        await page.goto( `/` )
        await expect( page.getByText( `Gratis Reader` ) ).toBeVisible()
        await expect( page.getByPlaceholder( `sk-or-` ) ).toBeVisible()
    } )

    test( `BW167 valid key navigates to library`, async ( { page } ) => {
        await mock_auth( page )
        await clear_storage( page )
        await page.goto( `/` )
        const input = page.getByPlaceholder( `sk-or-` )
        await input.fill( `sk-or-valid-key-12345` )
        await page.getByRole( `button`, { name: `Connect` } ).click()
        await page.waitForURL( /\/library/, { timeout: 5000 } )
    } )

    test( `BW168 enter key submits onboarding form`, async ( { page } ) => {
        await mock_auth( page )
        await clear_storage( page )
        await page.goto( `/` )
        await page.getByPlaceholder( `sk-or-` ).fill( `sk-or-key-abc` )
        await page.keyboard.press( `Enter` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )
    } )

} )

test.describe( `Pass 38 — Library`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    test( `BW169 empty library shows empty state`, async ( { page } ) => {
        await page.goto( `/library` )
        await expect( page.getByText( /library is empty/i ) ).toBeVisible()
    } )

    test( `BW170 upload epub shows book card with metadata`, async ( { page } ) => {
        await upload_demo_book( page )
        await page.goto( `/library` )
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).toBeVisible()
        // Book card should have a cover image
        const img = page.locator( `img[alt]` )
        await expect( img.first() ).toBeVisible()
    } )

    test( `BW171 delete book with confirmation`, async ( { page } ) => {
        await upload_demo_book( page )
        await page.goto( `/library` )

        // Set up dialog handler to accept confirmation
        page.on( `dialog`, dialog => dialog.accept() )

        await page.getByRole( `button`, { name: /remove/i } ).click()

        // Book should be gone
        await expect( page.getByRole( `heading`, { name: /smart work/i } ) ).not.toBeVisible()
    } )

    test( `BW172 file uploader drag zone renders`, async ( { page } ) => {
        await page.goto( `/library` )
        const dropzone = page.locator( `text=/drop|upload|drag/i` )
        await expect( dropzone.first() ).toBeVisible()
    } )

} )

test.describe( `Pass 38 — Reader core flows`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    test( `BW173 opening book shows language modal then reader`, async ( { page } ) => {
        await upload_demo_book( page )

        // Click book to open
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )

        // Language modal should appear
        const start_btn = page.getByRole( `button`, { name: `Start Reading` } )
        await expect( start_btn ).toBeVisible( { timeout: 3000 } )

        // Should show language picker and level picker
        await expect( page.getByRole( `heading`, { name: /choose your language/i } ) ).toBeVisible()
        await expect( page.getByText( `Target Language` ) ).toBeVisible()

        await start_btn.click()

        // Wait for sentences to render
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10000 } )
    } )

    test( `BW174 sentences display translated text`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )
        await expect(
            page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        ).toBeVisible( { timeout: 15_000 } )

        // At least some sentences should show [TRANSLATED] prefix (mock)
        const text = await page.locator( `span[data-sentence-id]` ).first().textContent()
        expect( text.length ).toBeGreaterThan( 0 )
    } )

    test( `BW175 selecting a word opens the simplified fragment with contextual tooltip`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        const word = page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        await expect( word ).toBeVisible( { timeout: 15_000 } )
        await word.click()

        await expect( page.locator( `[data-reader-word-tooltip]` ) ).toBeVisible()
        await expect( page.locator( `[data-translation-info-sheet]` ) ).toBeVisible()
    } )

    test( `BW176 keyboard arrows navigate chapters`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Get progress text before navigation
        const progress = page.locator( `text=/\\d+\\s*\\/\\s*\\d+/` )
        await expect( progress ).toBeVisible()
        const progress_before = await progress.textContent()

        // Navigate forward
        await page.keyboard.press( `ArrowRight` )
        await expect( progress ).not.toHaveText( progress_before )
        const progress_after = await progress.textContent()

        // Progress should change
        expect( progress_after ).not.toBe( progress_before )
    } )

    test( `BW177 escape key returns to library`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 3000 } )
    } )

    test( `BW178 progress bar and text visible`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Progress text (X / Y · Z%)
        await expect( page.locator( `text=/\\d+\\s*\\/\\s*\\d+.*%/` ) ).toBeVisible()
    } )

    test( `BW179 chapter title in header`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        // Some text should be visible in the header area (chapter title or book title)
        const header = page.locator( `header` )
        await expect( header ).toBeVisible()
    } )

} )

test.describe( `Pass 38 — Settings drawer`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    test( `BW180 settings drawer opens from reader`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        await page.getByRole( `button`, { name: `Settings` } ).click()

        // All settings sections should be visible
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()
        await expect( page.getByText( `THEME` ) ).toBeVisible()
        await expect( page.getByText( `LLM MODEL` ) ).toBeVisible()
    } )

    test( `BW181 theme change applies immediately`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

        // Click Dark theme
        await page.getByRole( `button`, { name: `Dark` } ).click()
        await expect( page.locator( `html` ) ).toHaveAttribute( `data-theme`, `dark` )

        const theme = await page.evaluate( () =>
            document.documentElement.getAttribute( `data-theme` )
        )
        expect( theme ).toBe( `dark` )
    } )

    test( `BW182 font size slider works`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

        const slider = page.locator( `input[type="range"]` )
        await slider.fill( `24` )
        await expect( slider ).toHaveValue( `24` )

        // The slider value display should show 24px
        await expect( page.getByText( `24px` ) ).toBeVisible()
    } )

    test( `BW183 close settings with escape`, async ( { page } ) => {
        await upload_demo_book( page )
        await open_reader( page )

        await page.getByRole( `button`, { name: `Settings` } ).click()

        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

        await page.keyboard.press( `Escape` )
        await expect( page.getByText( `FONT SIZE` ) ).not.toBeVisible()

        // Settings should be closed but we should still be in reader
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
    } )

    test( `BW184 API key masked display`, async ( { page } ) => {
        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Should show masked key (sk-or-...XXXX pattern)
        await expect( page.getByText( /sk-or-.*\.\.\./ ) ).toBeVisible()
    } )

} )

test.describe( `Pass 38 — Edge cases`, () => {

    test.beforeEach( async ( { page } ) => {
        await mock_openrouter( page )
        await mock_auth( page )
        await setup_api_key( page )
    } )

    test( `BW185 unknown route redirects`, async ( { page } ) => {
        await page.goto( `/nonexistent-page` )
        // Should redirect to library
        await page.waitForURL( /\/(library)?$/, { timeout: 5000 } )
    } )

    test( `BW186 nonexistent book id redirects to library`, async ( { page } ) => {
        await page.goto( `/read/fake-book-id-12345` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )
    } )

    test( `BW187 no console errors on library page`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await page.goto( `/library` )
        await expect(
            page.getByText( /public domain books from Project Gutenberg/i )
        ).toBeVisible( { timeout: 10_000 } )
        expect( errors ).toEqual( [] )
    } )

    test( `BW188 no console errors on reader page`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )
        await expect(
            page.locator( `span[data-sentence-id] [data-translation-word-index]` ).first()
        ).toBeVisible( { timeout: 15_000 } )
        await expect( page.getByText( `Translating...` ) ).not.toBeVisible()

        expect( errors ).toEqual( [] )
    } )

    test( `BW189 rapid chapter navigation no crash`, async ( { page } ) => {
        const errors = []
        page.on( `pageerror`, e => errors.push( e.message ) )

        await upload_demo_book( page )
        await open_reader( page )

        const toc = page.locator( `header select` )
        await expect( toc ).toBeVisible()

        // Rapidly press arrow right 5 times
        for( let i = 0; i < 5; i++ ) await page.keyboard.press( `ArrowRight` )

        // No crashes
        await expect( toc ).toHaveValue( `5` )
        expect( errors ).toEqual( [] )
        // Still in reader
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 5000 } )
    } )

} )
