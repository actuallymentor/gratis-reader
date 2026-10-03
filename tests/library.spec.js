import {
    test,
    expect,
    open_seeded_reader,
    SEEDED_BOOK_ID,
    SEEDED_BOOK_TITLE,
    SEEDED_READER_URL
} from './helpers/app_fixture.js'
import { mock_openrouter } from './helpers/setup.js'
import { confirm_in_modal } from './helpers/confirm_modal.js'

const DEMO_EPUB = `./tests/fixtures/book.epub`

// Parsing the 2 MB EPUB takes ~2 s idle but 40 s+ on a loaded machine; ceilings cost nothing when fast
const UPLOAD_TIMEOUT = 60_000

const book_heading = page => page.getByRole( `heading`, { name: SEEDED_BOOK_TITLE } )

/**
 * Reads every record of an IndexedDB store, straight from the app database.
 * @param {import('@playwright/test').Page} page
 * @param {string} store_name
 * @returns {Promise<Object[]>}
 */
const get_store_records = ( page, store_name ) => page.evaluate( name => new Promise( ( resolve, reject ) => {
    const request = indexedDB.open( `gratis_reader` )
    request.onerror = () => reject( request.error )
    request.onsuccess = () => {
        const records = request.result.transaction( name, `readonly` ).objectStore( name ).getAll()
        records.onsuccess = () => resolve( records.result )
        records.onerror = () => reject( records.error )
    }
} ), store_name )

const store_count = async ( page, store_name ) => ( await get_store_records( page, store_name ) ).length

// The 1857-card catalogue keeps /library busy, so actionability "stable" checks can
// stall for 20 s+ on a loaded machine (see GOTCHAS); force skips that wait
const delete_seeded_book = page => confirm_in_modal( page, {
    title: `Remove “${ SEEDED_BOOK_TITLE }”?`,
    action: () => page.getByRole( `button`, { name: `Remove` } ).click( { force: true } )
} )

test.describe( `Library`, () => {

    test.describe( `without books`, () => {

        test.use( { app_state: `authenticated` } )

        test( `shows the app title, empty state and Gutenberg catalogue without page errors`, async ( { page } ) => {

            const errors = []
            page.on( `pageerror`, error => errors.push( error.message ) )

            await page.goto( `/library` )
            await expect( page.getByText( `Your library is empty` ) ).toBeVisible( { timeout: 15_000 } )
            await expect( page.getByText( `Gratis Reader` ) ).toBeVisible()
            await expect( page.getByText( /public domain books from Project Gutenberg/i ) ).toBeVisible( { timeout: 10_000 } )

            expect( errors ).toEqual( [] )

        } )

        test( `rejects non-EPUB files and only offers .epub in the picker`, async ( { page } ) => {

            await page.goto( `/library` )

            const file_input = page.locator( `input[type="file"]` )
            await expect( file_input ).toHaveAttribute( `accept`, `.epub` )

            // The accept filter is only a hint: a forced non-EPUB pick must still be refused.
            // FileUploader checks the extension only, so one non-.epub name covers .txt/.mobi alike.
            await file_input.setInputFiles( { name: `fake_book.txt`, mimeType: `text/plain`, buffer: Buffer.from( `not an epub` ) } )
            await expect( page.getByText( /only epub files are supported/i ) ).toBeVisible()

            await expect( page.getByText( `Your library is empty` ) ).toBeVisible()
            expect( await store_count( page, `books` ) ).toBe( 0 )

        } )

        test( `uploads an EPUB: card shows title, author and extracted cover, and survives a reload`, async ( { page } ) => {

            test.slow()

            await page.goto( `/library` )
            await page.locator( `input[type="file"]` ).setInputFiles( DEMO_EPUB )

            await expect( book_heading( page ) ).toBeVisible( { timeout: UPLOAD_TIMEOUT } )
            await expect( page.getByText( `Mentor Palokaj` ) ).toBeVisible()

            // Cover comes from the EPUB itself, so the img only exists if extraction worked
            const cover = page.locator( `img[alt="${ SEEDED_BOOK_TITLE }"]` )
            await expect( cover ).toBeVisible()
            await expect( cover ).toHaveAttribute( `src`, /^blob:/ )

            // Persisted to IndexedDB, not just held in memory
            await page.reload()
            await expect( book_heading( page ) ).toBeVisible( { timeout: 30_000 } )
            const books = await get_store_records( page, `books` )
            expect( books.map( book => book.id ) ).toEqual( [ SEEDED_BOOK_ID ] )

        } )

        test( `offline banner appears and clears with the network`, async ( { page } ) => {

            // The banner only needs the library mounted, not the heavy catalogue settled
            await page.goto( `/library` )
            await expect( page.getByRole( `button`, { name: /settings/i } ).first() ).toBeVisible()
            const banner = page.getByText( `Offline · showing your saved library`, { exact: true } )

            await page.context().setOffline( true )
            await expect( banner ).toBeVisible()

            await page.context().setOffline( false )
            await expect( banner ).not.toBeVisible()

        } )

        test( `unknown routes redirect to the library`, async ( { page } ) => {
            await page.goto( `/totally-random-url` )
            await expect( page ).toHaveURL( /\/library\/?$/ )
        } )

        test( `a reader URL for a book that never existed redirects to the library`, async ( { page } ) => {
            await page.goto( `/read/fake-book-12345` )
            await page.waitForURL( /\/library/ )
        } )

    } )

    test.describe( `with a stored book`, () => {

        test.use( { app_state: `book` } )

        test( `opens a book when clicking the book card`, async ( { page } ) => {

            await page.goto( `/library` )

            // The seeded book has no cover, so click the card heading (force: see delete_seeded_book)
            await book_heading( page ).click( { force: true } )
            await page.waitForURL( /\/read\//, { timeout: 5000 } )
            expect( page.url() ).toContain( SEEDED_READER_URL )

        } )

        test( `re-uploading the same book shows progress and replaces it instead of duplicating`, async ( { page } ) => {

            test.slow()

            await page.goto( `/library` )
            await expect( book_heading( page ) ).toBeVisible( { timeout: 10_000 } )
            const [ seeded ] = await get_store_records( page, `books` )

            // The seeded copy has the upload's id, so this exercises the upsert path
            const processing = page.getByText( `Processing…` )
            await Promise.all( [
                processing.waitFor( { state: `visible` } ),
                page.locator( `input[type="file"]` ).setInputFiles( DEMO_EPUB )
            ] )
            await expect( processing ).not.toBeVisible( { timeout: UPLOAD_TIMEOUT } )

            await expect.poll( async () => ( await get_store_records( page, `books` ) )[ 0 ]?.added_at )
                .not.toBe( seeded.added_at )
            expect( await store_count( page, `books` ) ).toBe( 1 )
            await expect( book_heading( page ) ).toHaveCount( 1 )

        } )

    } )

    test.describe( `deleting a read book`, () => {

        test.use( { app_state: `reader` } )

        test( `removes the card, progress and token usage, keeps translations, and retires its reader URL`, async ( { page } ) => {

            // Long multi-page journey on the busy /library page
            test.slow()

            const errors = []
            page.on( `pageerror`, error => errors.push( error.message ) )

            // Reading generates progress, token usage and cached translations
            await mock_openrouter( page )
            await open_seeded_reader( page )
            await expect.poll( () => store_count( page, `token_usage` ), { timeout: 15_000 } ).toBeGreaterThan( 0 )
            await expect.poll( () => store_count( page, `translations` ), { timeout: 15_000 } ).toBeGreaterThan( 0 )
            expect( await store_count( page, `progress` ) ).toBeGreaterThan( 0 )

            await page.getByRole( `button`, { name: /back/i } ).click()
            await page.waitForURL( /\/library/ )
            await delete_seeded_book( page )

            // UI: card gone, empty state back
            await expect( page.getByText( `Your library is empty` ) ).toBeVisible()
            await expect( book_heading( page ) ).toHaveCount( 0 )

            // Storage: per-book data removed, expensive translations kept for re-imports
            await expect.poll( () => store_count( page, `books` ) ).toBe( 0 )
            await expect.poll( () => store_count( page, `progress` ) ).toBe( 0 )
            await expect.poll( () => store_count( page, `token_usage` ) ).toBe( 0 )
            expect( await store_count( page, `translations` ) ).toBeGreaterThan( 0 )

            // The deleted book's reader URL now bounces to the library
            await page.goto( SEEDED_READER_URL )
            await page.waitForURL( /\/library/ )

            expect( errors ).toEqual( [] )

        } )

    } )

} )
