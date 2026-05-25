import { test, expect } from '@playwright/test'

const mount_update_prompt = async ( page, options ) => {
    await page.evaluate( async ( mount_options ) => {
        const { mount_update_prompt } = await import( `/tests/fixtures/pwa_update_harness.jsx` )
        mount_update_prompt( mount_options )
    }, options )
}

const mount_update_badge = async ( page, options ) => {
    await page.evaluate( async ( mount_options ) => {
        const { mount_update_badge } = await import( `/tests/fixtures/pwa_update_harness.jsx` )
        mount_update_badge( mount_options )
    }, options )
}

test.describe( `PWA updates`, () => {

    test.beforeEach( async ( { page } ) => {
        await page.goto( `/` )
    } )

    test( `renders an accessible update badge when a version is waiting`, async ( { page } ) => {

        await mount_update_prompt( page, { need_refresh: true, updating: false } )

        const update_button = page.getByRole( `button`, { name: `New version available, click here to update` } )
        await expect( update_button ).toBeVisible()
        await expect( update_button ).not.toHaveAttribute( `aria-live` )
        await expect( page.getByRole( `status` ) ).toHaveText( `New version available, click here to update` )

    } )

    test( `announces updating state without aria-live on the button`, async ( { page } ) => {

        await mount_update_prompt( page, { need_refresh: true, updating: true } )

        const update_button = page.getByRole( `button`, { name: `Updating...` } )
        await expect( update_button ).toBeVisible()
        await expect( update_button ).toBeDisabled()
        await expect( update_button ).toHaveAttribute( `aria-busy`, `true` )
        await expect( update_button ).not.toHaveAttribute( `aria-live` )
        await expect( page.getByRole( `status` ) ).toHaveText( `Updating...` )

    } )

    test( `clicking the badge runs the service worker update and fallback reload`, async ( { page } ) => {

        await mount_update_badge( page, { need_refresh: true, reload_fallback_ms: 500 } )

        await page.getByRole( `button`, { name: `New version available, click here to update` } ).click()

        await expect( page.getByRole( `button`, { name: `Updating...` } ) ).toBeDisabled()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 1 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 1 )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.register_errors ) ).toBe( 0 )

    } )

    test( `failed service worker update re-enables the badge`, async ( { page } ) => {

        await page.evaluate( () => {
            console.error = () => {}
        } )
        await mount_update_badge( page, { need_refresh: true, reject_update: true } )

        await page.getByRole( `button`, { name: `New version available, click here to update` } ).click()

        const update_button = page.getByRole( `button`, { name: `New version available, click here to update` } )
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.update_calls ) ).toBe( 1 )
        await expect( update_button ).toBeEnabled()
        await expect.poll( () => page.evaluate( () => window.__pwa_update_test.reloads ) ).toBe( 0 )

    } )

    test( `PWA config uses a single prompt registration path`, async () => {

        const { readFileSync } = await import( `fs` )
        const vite_config = readFileSync( `./vite.config.js`, `utf-8` )

        expect( vite_config ).toContain( `registerType: \`prompt\`` )
        expect( vite_config ).toContain( `injectRegister: null` )
        expect( vite_config ).not.toContain( `registerType: \`autoUpdate\`` )

    } )

} )
