import { execSync } from 'node:child_process'
import { test, expect, open_seeded_reader, SEEDED_READER_URL } from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'
import { confirm_in_modal } from './helpers/confirm_modal.js'

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

// Persisted zustand state, as the next page load will hydrate it
const stored_settings = page => page.evaluate( () => JSON.parse( localStorage.getItem( `settings-storage` ) ) )

const css_var = ( page, name ) => page.evaluate( variable =>
    getComputedStyle( document.documentElement ).getPropertyValue( variable ).trim(), name )

const theme_attribute = page => page.locator( `html` )

const open_settings = async page => {
    await page.getByRole( `button`, { name: `Settings` } ).click()
    const drawer = page.getByRole( `dialog`, { name: `Settings` } )
    await expect( drawer ).toBeVisible()
    return drawer
}

// The 1857-book Gutenberg catalogue keeps /library's main thread busy for seconds
// (clicks wait on "stable"); settings never read it, so serve an empty one
const skip_gutenberg_catalogue = page => page.route( `**/gutenberg.json`, route => route.fulfill( { json: [] } ) )

// IndexedDB record count for one store of the app database
const store_count = ( page, store_name ) => page.evaluate( name => new Promise( resolve => {
    const request = indexedDB.open( `gratis_reader` )
    request.onsuccess = () => {
        const count = request.result.transaction( name, `readonly` ).objectStore( name ).count()
        count.onsuccess = () => resolve( count.result )
        count.onerror = () => resolve( -1 )
    }
    request.onerror = () => resolve( -1 )
} ), store_name )

test.describe( `Settings`, () => {

    test.use( { app_state: `authenticated` } )

    test.beforeEach( async ( { page } ) => {
        await skip_gutenberg_catalogue( page )
    } )

    test( `Luna is the default, the model list is complete and the choice survives a reload`, async ( { page } ) => {

        await page.goto( `/library`, { waitUntil: `domcontentloaded` } )
        await open_settings( page )

        const model_select = page.getByLabel( `LLM Model` )
        await expect( model_select ).toHaveValue( `openai/gpt-6-luna` )
        await expect( model_select.locator( `option[value="openai/gpt-6-luna"]` ) ).toHaveCount( 1 )
        expect( await model_select.locator( `option` ).count() ).toBeGreaterThanOrEqual( 3 )

        // Every choice is written to storage at once; ending on a non-default proves hydration
        for( const model of [ `google/gemini-3.8-flash`, `openai/gpt-6-luna`, `anthropic/claude-sonnet-5.5` ] ) {
            await model_select.selectOption( model )
            await expect.poll( async () => ( await stored_settings( page ) ).state.model ).toBe( model )
        }

        await page.reload( { waitUntil: `domcontentloaded` } )
        await open_settings( page )
        await expect( model_select ).toHaveValue( `anthropic/claude-sonnet-5.5` )

    } )

    for( const [ saved_model, expected_model ] of [
        [ `anthropic/claude-sonnet-4-6`, `anthropic/claude-sonnet-4.6` ],
        [ `anthropic/claude-haiku-4-5-20251001`, `anthropic/claude-haiku-4.5` ],
        [ `google/gemini-2.0-flash-001`, `google/gemini-3.8-flash` ],
        [ `openai/gpt-4o-mini`, `openai/gpt-4o-mini` ],
    ] ) {
        test.describe( `legacy ${ saved_model }`, () => {

            // Seed version-0 storage before the first load, so one hydration runs the migration
            test.use( {
                storageState: async ( { baseURL }, use ) => use( {
                    cookies: [],
                    origins: [ {
                        origin: new URL( baseURL ).origin,
                        localStorage: [ {
                            name: `settings-storage`,
                            value: JSON.stringify( {
                                state: { api_key: `sk-or-test-fake-key`, model: saved_model, font_size: 24 },
                                version: 0
                            } )
                        } ]
                    } ]
                } )
            } )

            test( `saved ${ saved_model } restores as ${ expected_model }`, async ( { page } ) => {

                await page.goto( `/library`, { waitUntil: `domcontentloaded` } )
                await open_settings( page )
                await expect( page.getByLabel( `LLM Model` ) ).toHaveValue( expected_model )
                await expect( page.locator( `input[type="range"]` ) ).toHaveValue( `24` )

                // The repaired state is written back at the current version, so the next
                // hydration reads it as-is instead of migrating again
                await expect.poll( () => stored_settings( page ) ).toMatchObject( {
                    version: 2,
                    state: { model: expected_model, font_size: 24 }
                } )

            } )

        } )
    }

    test( `library drawer shows display and model sections, closes via Close and Escape`, async ( { page } ) => {

        await page.goto( `/library` )
        const drawer = await open_settings( page )

        await expect( drawer.getByText( `Font size`, { exact: true } ) ).toBeVisible()
        await expect( drawer.getByText( `Theme`, { exact: true } ) ).toBeVisible()
        await expect( drawer.getByText( `LLM Model`, { exact: true } ) ).toBeVisible()

        // Library drawer has no reading-language controls
        await expect( drawer.getByText( `Target language`, { exact: true } ) ).toHaveCount( 0 )

        await drawer.getByRole( `button`, { name: `Close`, exact: true } ).click()
        await expect( drawer ).toBeHidden()

        await open_settings( page )
        await page.keyboard.press( `Escape` )
        await expect( drawer ).toBeHidden()
        await expect( page ).toHaveURL( /\/library$/ )

    } )

    test( `theme buttons set data-theme and visibly change the colours`, async ( { page } ) => {

        await page.goto( `/library` )
        await open_settings( page )

        await page.getByRole( `button`, { name: `Dark` } ).click()
        await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `dark` )
        const dark_bg = await css_var( page, `--bg` )

        // Dark backgrounds have low average RGB
        const body_bg = await page.evaluate( () => getComputedStyle( document.body ).backgroundColor )
        const [ red, green, blue ] = body_bg.match( /\d+/g ).map( Number )
        expect( ( red + green + blue ) / 3 ).toBeLessThan( 100 )

        await page.getByRole( `button`, { name: `Sepia` } ).click()
        await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `sepia` )
        const sepia_bg = await css_var( page, `--bg` )
        const sepia_accent = await css_var( page, `--accent` )

        // Sepia swaps the default cyan accent for a warm one
        expect( sepia_accent ).toBeTruthy()
        expect( sepia_accent ).not.toContain( `7ec0d0` )

        await page.getByRole( `button`, { name: `Light` } ).click()
        await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `light` )
        const light_bg = await css_var( page, `--bg` )

        // Three distinct backgrounds
        expect( new Set( [ dark_bg, sepia_bg, light_bg ] ).size ).toBe( 3 )
        expect( dark_bg ).toBeTruthy()

    } )

    test( `maintenance offers force update and shows the build commit`, async ( { page } ) => {

        await page.goto( `/library` )
        await open_settings( page )

        await expect( page.getByText( `Maintenance`, { exact: true } ) ).toBeVisible()
        await expect( page.getByRole( `button`, { name: `Force Update` } ) ).toBeVisible()
        await expect( page.getByText( `Version: ${ expected_commit_hash() }` ) ).toBeVisible()

    } )

    test( `remove API key returns to onboarding`, async ( { page } ) => {

        await page.goto( `/library` )
        await open_settings( page )

        await confirm_in_modal( page, {
            title: `Remove your API key?`,
            action: () => page.getByRole( `button`, { name: `Remove API Key` } ).click()
        } )
        await page.waitForURL( `/`, { timeout: 5000 } )

        await expect( page.locator( `input[type="password"]` ) ).toBeVisible()

    } )

    test.describe( `in the reader`, () => {

        test.use( { app_state: `reader` } )

        test.beforeEach( async ( { page } ) => {
            await mock_openrouter( page )
        } )

        test( `drawer lists every section and closes via Close or Escape without leaving the reader`, async ( { page } ) => {

            await open_seeded_reader( page )
            const drawer = await open_settings( page )

            for( const label of [ `Target language`, `Proficiency level`, `Font size`, `Font family`, `Theme`, `LLM Model`, `API key` ] ) {
                await expect( drawer.getByText( label, { exact: true } ) ).toBeVisible()
            }
            await expect( drawer.getByRole( `button`, { name: `Clear Translation Cache` } ) ).toBeVisible()

            // Every level from A0 Caveman to C1-C2 Adult
            const levels = drawer.getByRole( `radiogroup`, { name: `Proficiency level` } ).getByRole( `radio` )
            await expect( levels ).toHaveCount( 5 )
            for( const name of [ /A0\s*Caveman/, /A1\s*Toddler/, /A2\s*Primary Schooler/, /C1-C2\s*Adult/ ] ) {
                await expect( drawer.getByRole( `radio`, { name } ) ).toBeVisible()
            }

            await drawer.getByRole( `button`, { name: `Close`, exact: true } ).click()
            await expect( drawer ).toBeHidden()

            // Escape closes the drawer only; a second Escape would leave the reader
            await open_settings( page )
            await page.keyboard.press( `Escape` )
            await expect( drawer ).toBeHidden()
            await expect( page ).toHaveURL( new RegExp( `${ SEEDED_READER_URL }$` ) )
            await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()

        } )

        test( `font size applies to reader text and shows its px label`, async ( { page } ) => {

            await open_seeded_reader( page )
            const reader = page.locator( `main` )
            const initial_size = await reader.evaluate( main => getComputedStyle( main ).fontSize )

            const drawer = await open_settings( page )
            const slider = page.locator( `input[type="range"]` )
            await slider.fill( `24` )

            await expect( slider ).toHaveValue( `24` )
            await expect( drawer.getByText( `24px`, { exact: true } ) ).toBeVisible()
            await expect( reader ).not.toHaveCSS( `font-size`, initial_size )
            await expect( reader ).toHaveCSS( `font-size`, `24px` )

        } )

        test( `font family and model changes apply in the reader without errors`, async ( { page } ) => {

            const errors = []
            page.on( `pageerror`, error => errors.push( error.message ) )

            await open_seeded_reader( page )
            const drawer = await open_settings( page )
            const reader = page.locator( `main` )

            for( const font of [ `Georgia`, `Merriweather` ] ) {
                await page.getByLabel( `Font family` ).selectOption( font )
                await expect( reader ).toHaveCSS( `font-family`, new RegExp( font ) )
            }

            const model_select = page.getByLabel( `LLM Model` )
            await model_select.selectOption( `anthropic/claude-sonnet-4.6` )
            await expect( model_select ).toHaveValue( `anthropic/claude-sonnet-4.6` )

            // Choices outlive the drawer and the reader keeps working
            await page.keyboard.press( `Escape` )
            await expect( drawer ).toBeHidden()
            await expect( reader ).toHaveCSS( `font-family`, /Merriweather/ )
            await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible()
            expect( errors ).toEqual( [] )

        } )

        test( `clear cache: Cancel keeps translations, confirm empties IndexedDB`, async ( { page } ) => {

            await open_seeded_reader( page )
            await expect.poll( () => store_count( page, `translations` ), { timeout: 15_000 } ).toBeGreaterThan( 0 )

            const drawer = await open_settings( page )
            const clear_button = drawer.getByRole( `button`, { name: `Clear Translation Cache` } )

            await confirm_in_modal( page, { title: `Clear all cached translations?`, action: () => clear_button.click(), cancel: true } )
            await expect( drawer ).toBeVisible()
            expect( await store_count( page, `translations` ) ).toBeGreaterThan( 0 )

            await confirm_in_modal( page, { title: `Clear all cached translations?`, action: () => clear_button.click() } )
            await expect( page.getByText( `Translation cache cleared` ) ).toBeVisible()
            await expect.poll( () => store_count( page, `translations` ) ).toBe( 0 )

            // Settings stays usable
            await expect( drawer.getByText( `Font size`, { exact: true } ) ).toBeVisible()

        } )

        test( `theme persists across reader, library, reload and back`, async ( { page } ) => {

            await open_seeded_reader( page )
            const drawer = await open_settings( page )
            await page.getByRole( `button`, { name: `Dark` } ).click()
            await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `dark` )

            await page.keyboard.press( `Escape` )
            await expect( drawer ).toBeHidden()
            await page.keyboard.press( `Escape` )
            await page.waitForURL( /\/library/ )
            await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `dark` )

            // Fresh hydration from storage
            await page.reload()
            await expect( page.getByRole( `button`, { name: `Settings` } ) ).toBeVisible()
            await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `dark` )

            await open_seeded_reader( page )
            await expect( theme_attribute( page ) ).toHaveAttribute( `data-theme`, `dark` )

        } )

        test( `font size persists after page reload`, async ( { page } ) => {

            await open_seeded_reader( page )
            const drawer = await open_settings( page )
            await page.locator( `input[type="range"]` ).fill( `22` )
            await expect( page.locator( `main` ) ).toHaveCSS( `font-size`, `22px` )
            await page.keyboard.press( `Escape` )
            await expect( drawer ).toBeHidden()

            await page.reload()
            await expect( page.locator( `span[data-sentence-id]` ).first() ).toBeVisible( { timeout: 10_000 } )
            await expect( page.locator( `main` ) ).toHaveCSS( `font-size`, `22px` )

            // The slider hydrates too, not just the CSS
            await open_settings( page )
            await expect( page.locator( `input[type="range"]` ) ).toHaveValue( `22` )

        } )

    } )

} )
