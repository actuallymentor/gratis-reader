import {
    test,
    expect,
    SEEDED_BOOK_ID,
    SEEDED_READER_URL
} from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'

test.describe( `isolated app fixture`, () => {

    test.describe( `empty state`, () => {
        test.use( { app_state: `empty` } )

        test( `opens onboarding without an API key`, async ( { page } ) => {
            await page.goto( `/` )
            await expect( page.locator( `input[type="password"]` ) ).toBeVisible()
        } )
    } )

    test.describe( `authenticated state`, () => {
        test.use( { app_state: `authenticated` } )

        test( `opens an empty library with an API key`, async ( { page } ) => {
            await page.goto( `/library` )
            await expect( page.getByText( `Your library is empty` ) )
                .toBeVisible( { timeout: 15_000 } )
        } )
    } )

    test.describe( `book state`, () => {
        test.use( { app_state: `book` } )

        test( `stores the EPUB file as a real Blob`, async ( { page } ) => {
            const record = await page.evaluate( async book_id => {
                const { get_book } = await import( `/src/modules/cache.js` )
                const book = await get_book( book_id )
                return {
                    id: book.id,
                    is_blob: book.file instanceof Blob,
                    size: book.file.size,
                    type: book.file.type
                }
            }, SEEDED_BOOK_ID )

            expect( record ).toEqual( {
                id: SEEDED_BOOK_ID,
                is_blob: true,
                size: 1_964_592,
                type: `application/epub+zip`
            } )
        } )

        test( `shows first-open language selection`, async ( { page } ) => {
            await page.goto( SEEDED_READER_URL )
            await expect( page.getByRole( `button`, { name: `Start Reading` } ) ).toBeVisible()
        } )
    } )

    test.describe( `reader state`, () => {
        test.use( { app_state: `reader` } )

        test( `opens parsed reader content without first-open selection`, async ( { page } ) => {
            await mock_openrouter( page )
            await page.goto( SEEDED_READER_URL )
            await expect( page.locator( `span[data-sentence-id]` ).first() )
                .toBeVisible( { timeout: 10_000 } )
            await expect( page.getByRole( `button`, { name: `Start Reading` } ) ).not.toBeVisible()
        } )
    } )

} )
