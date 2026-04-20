import { test, expect } from '@playwright/test'
import { setup_api_key, upload_demo_book, mock_openrouter, clear_storage } from './helpers/setup.js'

test.describe( `Settings`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
    } )

    test( `settings drawer opens from gear icon on library`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()
        await expect( page.getByText( `THEME` ) ).toBeVisible()
        await expect( page.getByText( `LLM MODEL` ) ).toBeVisible()

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

    test( `font size change applies to reader text`, async ( { page } ) => {

        await mock_openrouter( page )
        await upload_demo_book( page )

        // Open book
        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.getByRole( `button`, { name: `Start Reading` } ).click()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Get initial font size
        const initial_size = await page.evaluate( () => {
            const main = document.querySelector( `main` )
            return main ? getComputedStyle( main ).fontSize : null
        } )

        // Open settings and change font size
        await page.getByRole( `button`, { name: `Settings` } ).click()
        const slider = page.locator( `input[type="range"]` )
        await slider.fill( `24` )
        await page.waitForTimeout( 300 )

        // Check new font size
        const new_size = await page.evaluate( () => {
            const main = document.querySelector( `main` )
            return main ? getComputedStyle( main ).fontSize : null
        } )

        expect( new_size ).not.toBe( initial_size )
        expect( parseInt( new_size ) ).toBe( 24 )

    } )

    test( `settings drawer opens from gear icon on reader`, async ( { page } ) => {

        await mock_openrouter( page )
        await upload_demo_book( page )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.getByRole( `button`, { name: `Start Reading` } ).click()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Reader settings should include language and level
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

    } )

    test( `font family change applies to reader`, async ( { page } ) => {

        await mock_openrouter( page )
        await upload_demo_book( page )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.getByRole( `button`, { name: `Start Reading` } ).click()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Open settings and change font family
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Find the font family select (not the model select)
        const font_select = page.locator( `select` ).filter( { hasText: /Nunito|Georgia/ } )
        await font_select.selectOption( `Georgia` )
        await page.waitForTimeout( 300 )

        // Close settings and verify font applied
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 300 )

        const font = await page.evaluate( () => {
            const main = document.querySelector( `main` )
            return main ? getComputedStyle( main ).fontFamily : null
        } )

        expect( font ).toContain( `Georgia` )

    } )

    test( `clear cache button works`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        // Accept the confirm dialog
        page.on( `dialog`, dialog => dialog.accept() )

        await page.getByRole( `button`, { name: `Clear Translation Cache` } ).click()
        await page.waitForTimeout( 1000 )

        // Should still be functional after clearing
        await expect( page.getByText( `FONT SIZE` ) ).toBeVisible()

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

    test( `font size setting persists after page reload`, async ( { page } ) => {

        await mock_openrouter( page )
        await upload_demo_book( page )

        await page.locator( `img[alt]` ).first().click()
        await page.waitForURL( /\/read\// )
        await page.getByRole( `button`, { name: `Start Reading` } ).click()
        await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )

        // Set font size to 22
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await page.locator( `input[type="range"]` ).fill( `22` )
        await page.keyboard.press( `Escape` )
        await page.waitForTimeout( 300 )

        // Reload
        await page.reload( { waitUntil: `networkidle` } )
        await page.waitForTimeout( 2000 )

        // Font size should still be 22px
        const size = await page.evaluate( () => {
            const main = document.querySelector( `main` )
            return main ? getComputedStyle( main ).fontSize : null
        } )
        expect( parseInt( size ) ).toBe( 22 )

    } )

} )
