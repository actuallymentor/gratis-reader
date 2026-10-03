/**
 * The one end-to-end journey through the real UI: onboarding, EPUB upload,
 * first open, chapter navigation and back. Everything else seeds state instead.
 */
import { test, expect } from './helpers/app_fixture.js'
import { mock_auth, mock_openrouter, open_reader } from './helpers/setup.js'
import { progress_text } from './helpers/reader.js'

test.describe( `Smoke`, () => {

    test.use( { app_state: `empty` } )

    test( `onboarding → upload → first open → chapter nav → library, with no page errors`, async ( { page } ) => {

        // Real UI upload: slow on a loaded machine, see library.spec
        test.slow()

        const errors = []
        page.on( `pageerror`, error => errors.push( error.message ) )

        await mock_auth( page )
        await mock_openrouter( page )

        // Onboarding
        await page.goto( `/` )
        await page.locator( `input[type="password"]` ).fill( `sk-or-test-key` )
        await page.getByRole( `button`, { name: `Connect` } ).click()
        await page.waitForURL( /\/library/, { timeout: 10_000 } )

        // Upload
        await page.locator( `input[type="file"]` ).setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 60_000 } )

        // First open goes through the language modal
        await open_reader( page )
        await expect( progress_text( page ) ).toHaveText( /^1 \// )

        // Chapter navigation
        await page.keyboard.press( `ArrowRight` )
        await expect( progress_text( page ) ).toHaveText( /^2 \// )

        // Back to the library
        await page.keyboard.press( `Escape` )
        await page.waitForURL( /\/library/, { timeout: 5000 } )

        expect( errors ).toEqual( [] )

    } )

} )
