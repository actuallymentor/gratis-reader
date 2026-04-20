import { test, expect } from '@playwright/test'
import { setup_api_key, clear_storage } from './helpers/setup.js'

test.describe( `Library`, () => {

    test.beforeEach( async ( { page } ) => {
        await clear_storage( page )
        await setup_api_key( page )
    } )

    test( `shows empty state when no books are uploaded`, async ( { page } ) => {
        await page.goto( `/library` )
        await expect( page.getByText( `Your library is empty` ) ).toBeVisible()
    } )

    test( `uploads an EPUB file via file input`, async ( { page } ) => {

        await page.goto( `/library` )

        const file_input = page.locator( `input[type="file"]` )
        await file_input.setInputFiles( `./tests/fixtures/book.epub` )

        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

    } )

    test( `displays book title and author after upload`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.locator( `input[type="file"]` ).setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

        // Check author
        await expect( page.getByText( `Mentor Palokaj` ) ).toBeVisible()

    } )

    test( `persists books across page reloads`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.locator( `input[type="file"]` ).setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

        // Reload
        await page.reload( { waitUntil: `networkidle` } )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

    } )

    test( `opens a book when clicking the book card`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.locator( `input[type="file"]` ).setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

        // Click the cover image
        await page.locator( `img[alt="Smart work beats hard work"]` ).click()
        await page.waitForURL( /\/read\//, { timeout: 5000 } )
        expect( page.url() ).toMatch( /\/read\// )

    } )

    test( `deletes a book with confirmation`, async ( { page } ) => {

        await page.goto( `/library` )
        await page.locator( `input[type="file"]` ).setInputFiles( `./tests/fixtures/book.epub` )
        await expect( page.getByRole( `heading`, { name: `Smart work beats hard work` } ) ).toBeVisible( { timeout: 10_000 } )

        // Accept the confirmation dialog
        page.on( `dialog`, dialog => dialog.accept() )

        // Click Remove
        await page.getByRole( `button`, { name: `Remove` } ).click()
        await page.waitForTimeout( 1000 )

        // Book should be gone, empty state visible
        await expect( page.getByText( `Your library is empty` ) ).toBeVisible()

    } )

} )
