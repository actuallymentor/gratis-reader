import { execSync } from 'node:child_process'
import { test, expect, open_seeded_reader } from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'

const expected_commit_hash = () => {

    const environment_commit = [
        process.env.CF_PAGES_COMMIT_SHA,
        process.env.GITHUB_SHA,
        process.env.COMMIT_REF,
        process.env.COMMIT_SHA
    ].find( Boolean )

    if( environment_commit ) return environment_commit.slice( 0, 12 )
    return execSync( `git rev-parse --short=12 HEAD`, { encoding: `utf8` } ).trim()

}

test.describe( `Settings`, () => {

    test.use( { app_state: `authenticated` } )

    test( `settings drawer opens from gear icon on library`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        const drawer = page.locator( `aside` )

        await expect( drawer.getByText( `Font Size`, { exact: true } ) ).toBeVisible()
        await expect( drawer.getByText( `Theme`, { exact: true } ) ).toBeVisible()
        await expect( drawer.getByText( `LLM Model`, { exact: true } ) ).toBeVisible()

    } )

    test( `theme change applies correct data attribute`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Switch to dark
        await page.getByRole( `button`, { name: `Dark` } ).click()
        const dark_theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( dark_theme ).toBe( `dark` )

        // Switch to sepia
        await page.getByRole( `button`, { name: `Sepia` } ).click()
        const sepia_theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( sepia_theme ).toBe( `sepia` )

        // Switch back to light
        await page.getByRole( `button`, { name: `Light` } ).click()
        const light_theme = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( light_theme ).toBe( `light` )

    } )

    test.describe( `Reader settings`, () => {

        test.use( { app_state: `reader` } )

        test( `font size change applies to reader text`, async ( { page } ) => {

            await mock_openrouter( page )
            await open_seeded_reader( page )

            // Get initial font size
            const initial_size = await page.evaluate( () => {
                const main = document.querySelector( `main` )
                return main ? getComputedStyle( main ).fontSize : null
            } )

            // Open settings and change font size
            await page.getByRole( `button`, { name: `Settings` } ).click()
            const slider = page.locator( `input[type="range"]` )
            await slider.fill( `24` )

            // Check new font size
            const reader = page.locator( `main` )
            await expect( reader ).not.toHaveCSS( `font-size`, initial_size )
            await expect( reader ).toHaveCSS( `font-size`, `24px` )

        } )

        test( `settings drawer opens from gear icon on reader`, async ( { page } ) => {

            await mock_openrouter( page )
            await open_seeded_reader( page )

            await page.getByRole( `button`, { name: `Settings` } ).click()

            // Reader settings should include language and level
            await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

        } )

        test( `font family change applies to reader`, async ( { page } ) => {

            await mock_openrouter( page )
            await open_seeded_reader( page )

            // Open settings and change font family
            await page.getByRole( `button`, { name: `Settings` } ).click()

            // Find the font family select (not the model select)
            const font_select = page.locator( `select` ).filter( { hasText: /Nunito|Georgia/ } )
            await font_select.selectOption( `Georgia` )
            await expect( page.locator( `main` ) ).toHaveCSS( `font-family`, /Georgia/ )

            // Close settings and verify font applied
            await page.keyboard.press( `Escape` )
            await expect( page.locator( `aside` ).filter( { hasText: `Target Language` } ) ).not.toBeVisible()
            await expect( page.locator( `main` ) ).toHaveCSS( `font-family`, /Georgia/ )

        } )

    } )

    test( `clear cache button works`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Accept and await the confirmation dialog so the cache operation has
        // definitely started before checking that settings remains usable.
        const dialog_handled = new Promise( resolve => {
            page.once( `dialog`, async dialog => {
                await dialog.accept()
                resolve()
            } )
        } )

        await page.getByRole( `button`, { name: `Clear Translation Cache` } ).click()
        await dialog_handled

        // Should still be functional after clearing
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

    } )

    test( `settings exposes force update fallback`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        await expect( page.getByText( `APP UPDATE` ) ).toBeVisible()
        await expect( page.getByRole( `button`, { name: `Force Update` } ) ).toBeVisible()

    } )

    test( `settings shows build commit hash`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        await expect( page.getByText( `Version: ${ expected_commit_hash() }` ) ).toBeVisible()

    } )

    test( `remove API key returns to onboarding`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Accept the confirm dialog
        page.on( `dialog`, dialog => dialog.accept() )

        await page.getByRole( `button`, { name: `Remove API Key` } ).click()
        await page.waitForURL( `/`, { timeout: 5000 } )

        // Should show onboarding
        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()

    } )

    test( `theme setting persists after page reload`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Switch to dark
        await page.getByRole( `button`, { name: `Dark` } ).click()
        const dark = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( dark ).toBe( `dark` )

        // Close settings and reload
        await page.keyboard.press( `Escape` )
        await page.reload( { waitUntil: `networkidle` } )

        // Theme should still be dark
        const after_reload = await page.evaluate( () => document.documentElement.getAttribute( `data-theme` ) )
        expect( after_reload ).toBe( `dark` )

    } )

    test.describe( `Reader setting persistence`, () => {

        test.use( { app_state: `reader` } )

        test( `font size setting persists after page reload`, async ( { page } ) => {

            await mock_openrouter( page )
            await open_seeded_reader( page )

            // Set font size to 22
            await page.getByRole( `button`, { name: `Settings` } ).click()
            await page.locator( `input[type="range"]` ).fill( `22` )
            await expect( page.locator( `main` ) ).toHaveCSS( `font-size`, `22px` )
            await page.keyboard.press( `Escape` )
            await expect( page.locator( `aside` ).filter( { hasText: `Target Language` } ) ).not.toBeVisible()

            // Reload
            await page.reload( { waitUntil: `networkidle` } )

            // Font size should still be 22px
            await expect( page.locator( `main` ) ).toHaveCSS( `font-size`, `22px` )

        } )

    } )

} )
