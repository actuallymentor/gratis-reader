import { test, expect } from './helpers/app_fixture.js'

test.describe( `Turbo Mode settings`, () => {

    test.use( { app_state: `authenticated` } )

    test( `requires confirmation, supports cancel and Escape, and persists the choice`, async ( { page } ) => {

        await page.goto( `/library`, { waitUntil: `domcontentloaded` } )
        await page.getByRole( `button`, { name: `Settings` } ).click()

        const turbo_switch = page.getByRole( `switch`, { name: `Turbo Mode` } )
        const dialog = page.getByRole( `dialog`, { name: `Enable Turbo Mode?` } )
        const persisted_turbo_mode = () => page.evaluate( () =>
            JSON.parse( localStorage.getItem( `settings-storage` ) ).state.turbo_mode === true
        )

        await expect( turbo_switch ).not.toBeChecked()
        await turbo_switch.click()
        await expect( dialog ).toBeVisible()
        await expect( dialog ).toContainText( `including words you might never look up` )
        await expect( dialog ).toContainText( `additional API credits` )
        await expect( dialog.getByRole( `button`, { name: `Cancel` } ) ).toBeFocused()
        expect( await persisted_turbo_mode() ).toBe( false )

        await dialog.getByRole( `button`, { name: `Cancel` } ).click()
        await expect( dialog ).not.toBeVisible()
        await expect( turbo_switch ).not.toBeChecked()
        await expect( turbo_switch ).toBeFocused()

        await turbo_switch.click()
        await page.keyboard.press( `Escape` )
        await expect( dialog ).not.toBeVisible()
        await expect( turbo_switch ).toBeVisible()
        await expect( turbo_switch ).not.toBeChecked()

        await turbo_switch.click()
        await dialog.getByRole( `button`, { name: `Enable Turbo Mode`, exact: true } ).click()
        await expect( dialog ).not.toBeVisible()
        await expect( turbo_switch ).toBeChecked()
        expect( await persisted_turbo_mode() ).toBe( true )

        await page.reload( { waitUntil: `domcontentloaded` } )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( turbo_switch ).toBeChecked()
        await turbo_switch.click()
        await expect( turbo_switch ).not.toBeChecked()
        await expect( dialog ).not.toBeVisible()
        expect( await persisted_turbo_mode() ).toBe( false )

        await page.reload( { waitUntil: `domcontentloaded` } )
        await page.getByRole( `button`, { name: `Settings` } ).click()
        await expect( turbo_switch ).not.toBeChecked()
        await turbo_switch.click()
        await expect( dialog ).toBeVisible()

    } )

} )
