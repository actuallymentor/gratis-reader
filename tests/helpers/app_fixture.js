import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { test as base, expect } from '@playwright/test'

export const SEEDED_BOOK_ID = `book_996fa7208f1b`
export const SEEDED_BOOK_TITLE = `Smart work beats hard work`
export const SEEDED_READER_URL = `/read/${ SEEDED_BOOK_ID }`

const TEST_API_KEY = `sk-or-test-fake-key`
const EPUB_MIME_TYPE = `application/epub+zip`
const DEMO_EPUB_PATH = fileURLToPath( new URL( `../fixtures/book.epub`, import.meta.url ) )

// Playwright loads this module once per worker, so every seeded test reuses one
// filesystem read while receiving its own browser-context Blob.
const demo_epub_bytes = readFile( DEMO_EPUB_PATH )

const settings_storage = () => JSON.stringify( {
    state: { api_key: TEST_API_KEY },
    version: 0
} )

export const test = base.extend( {

    app_state: [ `empty`, { option: true } ],

    storageState: async ( { app_state, baseURL }, use ) => {
        const origins = app_state === `empty`
            ? []
            : [ {
                origin: new URL( baseURL ).origin,
                localStorage: [ { name: `settings-storage`, value: settings_storage() } ]
            } ]

        await use( { cookies: [], origins } )
    },

    page: async ( { page, app_state, baseURL }, use ) => {
        if( app_state !== `book` && app_state !== `reader` ) {
            await use( page )
            return
        }

        const seed_page_url = `${ baseURL }/__playwright/seed`
        const epub_url = `${ baseURL }/__playwright/book.epub`

        await page.route( seed_page_url, route => route.fulfill( {
            contentType: `text/html`,
            body: `<!doctype html><title>Seed app state</title>`
        } ) )
        await page.route( epub_url, async route => route.fulfill( {
            contentType: EPUB_MIME_TYPE,
            body: await demo_epub_bytes
        } ) )

        await page.goto( seed_page_url )
        await page.evaluate( async ( { app_state: state, epub_url: file_url, book_id } ) => {
            const { save_book, save_progress } = await import( `/src/modules/cache.js` )
            const response = await fetch( file_url )
            const epub_bytes = await response.arrayBuffer()

            await save_book( {
                id: book_id,
                title: `Smart work beats hard work`,
                author: `Mentor Palokaj`,
                language: `en`,
                // Reader-state tests do not exercise cover extraction. Real upload
                // tests retain the production cover Blob and BookCard coverage.
                cover_image: null,
                file: new Blob( [ epub_bytes ], { type: `application/epub+zip` } ),
                added_at: `2026-01-01T00:00:00.000Z`
            } )

            if( state === `reader` ) {
                await save_progress( {
                    book_id,
                    chapter_index: 0,
                    scroll_position: 0,
                    last_read_at: `2026-01-01T00:00:00.000Z`
                } )
            }
        }, { app_state, epub_url, book_id: SEEDED_BOOK_ID } )

        await page.unroute( seed_page_url )
        await page.unroute( epub_url )
        await use( page )
    }

} )

/**
 * Opens the production reader for the isolated seeded book.
 * @param {import('@playwright/test').Page} page - Isolated browser page.
 * @returns {Promise<void>}
 */
export const open_seeded_reader = async page => {
    await page.goto( SEEDED_READER_URL )
    await expect( page.locator( `span[data-sentence-id]` ).first() )
        .toBeVisible( { timeout: 10_000 } )
}

export { expect }
