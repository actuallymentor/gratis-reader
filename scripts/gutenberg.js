#!/usr/bin/env node

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { resolve, dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import JSZip from 'jszip'

const __dirname = dirname( fileURLToPath( import.meta.url ) )
const OUTPUT_PATH = resolve( __dirname, `../public/gutenberg.json` )
const EPUB_DIR = resolve( __dirname, `../public/gutenberg_epubs` )
const BASE_URL = `https://gutendex.com/books/?sort=popular&copyright=false`

// Configuration — set one or the other
const PAGES = parseInt( process.env.GUTENBERG_PAGES ) || 0
const MIN_BOOKS = parseInt( process.env.GUTENBERG_MIN_BOOKS ) || 500

// Parallel download concurrency
const DOWNLOAD_CONCURRENCY = 5

const MAX_EPUB_BYTES = 25 * 1024 * 1024 // 25 MiB

const MAX_RETRY_ATTEMPTS = 5
const INITIAL_RETRY_DELAY_MS = 10_000       // 10s base for network/5xx errors
const RATE_LIMIT_MIN_DELAY_MS = 60_000      // 429 always waits at least 60s
const RETRY_BACKOFF_FACTOR = 2
const RETRY_JITTER_MAX_MS = 3_000           // random 0-3s jitter per delay

const REQUIRED_KEYS = [ `count`, `next`, `previous`, `results` ]
const EPUB_MIME = `application/epub+zip`

// Cover image variants — each book gets one file per variant
// Frontend can deterministically build paths: `{id}-{suffix}.webp`
const COVER_VARIANTS = [
    { suffix: `xs`,  width: 64,  quality: 50 },   // ~1–2 KB — blur-up placeholder, skeleton grids
    { suffix: `sm`,  width: 128, quality: 65 },   // ~3–6 KB — compact grid thumbnails
    { suffix: `md`,  width: 200, quality: 80 },   // ~8–15 KB — card display, original-ish res
]

function validate_response( data, url ) {

    for( const key of REQUIRED_KEYS ) {
        if( !( key in data ) ) {
            throw new Error( `Response from ${ url } missing required property "${ key }"` )
        }
    }

    if( !Array.isArray( data.results ) ) {
        throw new Error( `Response from ${ url } has non-array "results"` )
    }

}

function get_image_format( formats ) {
    const key = Object.keys( formats || {} ).find( k => k.startsWith( `image/` ) )
    if( !key ) return null
    return formats[ key ]
}

function extension_from_url( url ) {
    const ext = extname( new URL( url ).pathname )
    return ext || `.jpg`
}

function sleep( ms ) {
    return new Promise( resolve => setTimeout( resolve, ms ) )
}

async function validate_epub( epub_path ) {

    try {
        const buffer = readFileSync( epub_path )
        if( buffer.length === 0 ) return false
        const zip = await JSZip.loadAsync( buffer )
        return zip.file( `META-INF/container.xml` ) !== null
    } catch {
        return false
    }

}

function delete_book_files( book_id ) {

    const suffixes = [ `.epub`, `.jpg`, `-xs.webp`, `-sm.webp`, `-md.webp` ]

    for( const suffix of suffixes ) {
        const file_path = resolve( EPUB_DIR, `${ book_id }${ suffix }` )
        if( existsSync( file_path ) ) unlinkSync( file_path )
    }

}

async function scan_and_purge_corrupt_epubs() {

    if( !existsSync( EPUB_DIR ) ) return new Set()

    const files = readdirSync( EPUB_DIR ).filter( f => f.endsWith( `.epub` ) )
    if( files.length === 0 ) return new Set()

    console.log( `\nValidating ${ files.length } existing epub files...` )

    const corrupt_ids = new Set()

    for( let i = 0; i < files.length; i += DOWNLOAD_CONCURRENCY ) {

        const batch = files.slice( i, i + DOWNLOAD_CONCURRENCY )

        const results = await Promise.all( batch.map( async file => {
            const epub_path = resolve( EPUB_DIR, file )
            const valid = await validate_epub( epub_path )
            return { file, valid }
        } ) )

        for( const { file, valid } of results ) {
            if( !valid ) {
                const book_id = basename( file, `.epub` )
                delete_book_files( book_id )
                corrupt_ids.add( parseInt( book_id ) )
            }
        }

        const progress = Math.min( i + DOWNLOAD_CONCURRENCY, files.length )
        process.stdout.write( `  Validated: ${ progress }/${ files.length } (${ corrupt_ids.size } corrupt)\r` )

    }

    if( corrupt_ids.size > 0 ) {
        console.log( `\n  Purged ${ corrupt_ids.size } corrupt epub(s) and their associated files.` )
    } else {
        console.log( `\n  All ${ files.length } epubs are valid.` )
    }

    return corrupt_ids

}

async function fetch_with_retry( url, label = url ) {

    let delay = INITIAL_RETRY_DELAY_MS
    let last_error = null

    for( let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++ ) {

        try {

            const response = await fetch( url )

            // Success or non-retryable client error — return immediately
            if( response.ok || ( response.status >= 400 && response.status < 500 && response.status !== 429 ) ) {
                return response
            }

            // Retryable: 429 or 5xx
            const reason = response.status === 429 ? `rate-limited` : `server error ${ response.status }`
            const effective_delay = response.status === 429
                ? Math.max( delay, RATE_LIMIT_MIN_DELAY_MS )
                : delay

            if( attempt < MAX_RETRY_ATTEMPTS ) {
                const jitter = Math.floor( Math.random() * RETRY_JITTER_MAX_MS )
                console.warn( `\n  ${ reason } (${ label }), attempt ${ attempt }/${ MAX_RETRY_ATTEMPTS } — retrying in ${ ( effective_delay + jitter ) / 1000 }s...` )
                await sleep( effective_delay + jitter )
                delay *= RETRY_BACKOFF_FACTOR
            } else {
                console.warn( `\n  ${ reason } (${ label }), attempt ${ attempt }/${ MAX_RETRY_ATTEMPTS } — retries exhausted` )
                return response
            }

        } catch( err ) {

            // Network errors: DNS failure, connection reset, timeout
            last_error = err

            if( attempt < MAX_RETRY_ATTEMPTS ) {
                const jitter = Math.floor( Math.random() * RETRY_JITTER_MAX_MS )
                console.warn( `\n  Network error (${ label }): ${ err.message }, attempt ${ attempt }/${ MAX_RETRY_ATTEMPTS } — retrying in ${ ( delay + jitter ) / 1000 }s...` )
                await sleep( delay + jitter )
                delay *= RETRY_BACKOFF_FACTOR
            }

        }

    }

    // All retries exhausted with network errors
    throw last_error

}

async function fetch_page( url ) {

    const response = await fetch_with_retry( url, `page` )

    if( !response.ok ) {
        throw new Error( `HTTP ${ response.status } fetching ${ url }` )
    }

    const data = await response.json()
    validate_response( data, url )

    return data

}

async function download_file( url, filepath ) {

    const response = await fetch_with_retry( url, `download ${ basename( filepath ) }` )

    if( !response.ok ) return false

    const buffer = Buffer.from( await response.arrayBuffer() )
    writeFileSync( filepath, buffer )

    return true

}

async function generate_cover_variants( source_path, book_id ) {

    const generated = []

    for( const variant of COVER_VARIANTS ) {

        const out_filename = `${ book_id }-${ variant.suffix }.webp`
        const out_path = resolve( EPUB_DIR, out_filename )

        if( existsSync( out_path ) ) {
            generated.push( out_filename )
            continue
        }

        try {
            await sharp( source_path )
                .resize( { width: variant.width, withoutEnlargement: true } )
                .webp( { quality: variant.quality } )
                .toFile( out_path )
            generated.push( out_filename )
        } catch ( err ) {
            console.warn( `\n  Warning: failed to generate ${ out_filename }: ${ err.message }` )
        }

    }

    return generated

}

function derive_epub_urls( primary_url ) {

    // Gutenberg epub URLs follow: /ebooks/{id}.epub3.images
    // Prefer noimages variants — embedded images bloat epubs and break parsing
    const match = primary_url.match( /^(.+\/ebooks\/\d+)\..+$/ )
    if( !match ) return [ primary_url ]

    const base = match[1]
    return [
        `${ base }.epub3.noimages`,
        `${ base }.epub.noimages`,
        `${ base }.epub.images`,
        `${ base }.epub3.images`,
    ]

}

async function download_best_epub( primary_url, epub_path ) {

    for( const url of derive_epub_urls( primary_url ) ) {

        const ok = await download_file( url, epub_path )
        if( !ok ) continue

        if( statSync( epub_path ).size <= MAX_EPUB_BYTES ) return true
        unlinkSync( epub_path )

    }

    return false

}

async function download_book_assets( book ) {

    const result = { id: book.id, epub_skipped: false, cover_skipped: false, cover_filename: null }

    // --- Epub (with size limit enforcement) ---
    const epub_url = book.formats?.[ EPUB_MIME ]
    if( !epub_url ) {
        result.epub_failed = true
        return result
    }

    const epub_path = resolve( EPUB_DIR, `${ book.id }.epub` )

    if( existsSync( epub_path ) ) {

        if( statSync( epub_path ).size <= MAX_EPUB_BYTES ) {
            result.epub_skipped = true
        } else {
            unlinkSync( epub_path )
            const found = await download_best_epub( epub_url, epub_path )
            if( !found ) {
                result.epub_too_large = true
                return result
            }
        }

    } else {

        const found = await download_best_epub( epub_url, epub_path )
        if( !found ) {
            result.epub_failed = true
            return result
        }

    }

    // --- Cover image ---
    const cover_url = get_image_format( book.formats )
    if( cover_url ) {
        const ext = extension_from_url( cover_url )
        const cover_filename = `${ book.id }${ ext }`
        const cover_path = resolve( EPUB_DIR, cover_filename )
        result.cover_filename = cover_filename

        if( existsSync( cover_path ) ) {
            result.cover_skipped = true
        } else {
            const ok = await download_file( cover_url, cover_path )
            if( !ok ) {
                result.cover_failed = true
                result.cover_filename = null
            }
        }

        // Generate compressed WebP variants from the source cover
        if( result.cover_filename && existsSync( cover_path ) ) {
            result.variants = await generate_cover_variants( cover_path, book.id )
        }
    }

    return result

}

async function download_all_assets( books ) {

    mkdirSync( EPUB_DIR, { recursive: true } )

    console.log( `\nDownloading epubs and covers to ${ EPUB_DIR }...` )

    const excluded_ids = new Set()
    let epub_downloaded = 0
    let epub_skipped = 0
    let epub_too_large = 0
    let epub_failed = 0
    let cover_downloaded = 0
    let cover_skipped = 0
    let variants_generated = 0

    // Process in batches
    for( let i = 0; i < books.length; i += DOWNLOAD_CONCURRENCY ) {

        const batch = books.slice( i, i + DOWNLOAD_CONCURRENCY )

        const results = await Promise.allSettled(
            batch.map( book => download_book_assets( book ) )
        )

        for( const result of results ) {
            if( result.status !== `fulfilled` ) {
                console.warn( `\n  Download failed for batch item: ${ result.reason?.message || result.reason }` )
                continue
            }
            const v = result.value

            if( v.epub_too_large ) {
                epub_too_large++
                excluded_ids.add( v.id )
            } else if( v.epub_failed ) {
                epub_failed++
                excluded_ids.add( v.id )
            } else if( v.epub_skipped ) epub_skipped++
            else epub_downloaded++

            if( v.cover_skipped ) cover_skipped++
            else if( v.cover_filename ) cover_downloaded++

            if( v.variants ) variants_generated += v.variants.length

            // Attach cover filename to book object
            const book = books.find( b => b.id === v.id )
            if( book && v.cover_filename ) book.cover = v.cover_filename
        }

        const progress = Math.min( i + DOWNLOAD_CONCURRENCY, books.length )
        process.stdout.write( `  Progress: ${ progress }/${ books.length } | epubs: ${ epub_downloaded } new, ${ epub_skipped } cached, ${ epub_too_large } too large, ${ epub_failed } failed | covers: ${ cover_downloaded } new, ${ cover_skipped } cached\r` )

    }

    console.log( `\n  Done. Epubs: ${ epub_downloaded } new, ${ epub_skipped } cached, ${ epub_too_large } skipped (>${ MAX_EPUB_BYTES / 1024 / 1024 } MiB), ${ epub_failed } failed. Covers: ${ cover_downloaded } new, ${ cover_skipped } cached. Variants: ${ variants_generated } generated.` )

    return excluded_ids

}

function load_existing_catalog() {

    if( !existsSync( OUTPUT_PATH ) ) return new Map()

    try {
        const raw = JSON.parse( readFileSync( OUTPUT_PATH, `utf-8` ) )
        const map = new Map()
        for( const book of raw ) map.set( book.id, book )
        console.log( `Loaded ${ map.size } existing books from catalog.` )
        return map
    } catch {
        console.warn( `Could not parse existing catalog — starting fresh.` )
        return new Map()
    }

}

async function regenerate_all_variants() {

    if( !existsSync( EPUB_DIR ) ) {
        console.log( `No covers directory found at ${ EPUB_DIR }` )
        return
    }

    const files = readdirSync( EPUB_DIR )
    const covers = files.filter( f => /^\d+\.(jpg|jpeg|png|gif)$/i.test( f ) )

    console.log( `Regenerating variants for ${ covers.length } existing covers...` )

    let total = 0

    for( let i = 0; i < covers.length; i += DOWNLOAD_CONCURRENCY ) {

        const batch = covers.slice( i, i + DOWNLOAD_CONCURRENCY )

        await Promise.all( batch.map( async cover => {
            const book_id = basename( cover, extname( cover ) )
            const source = resolve( EPUB_DIR, cover )
            const variants = await generate_cover_variants( source, book_id )
            total += variants.length
        } ) )

        const progress = Math.min( i + DOWNLOAD_CONCURRENCY, covers.length )
        process.stdout.write( `  Progress: ${ progress }/${ covers.length } covers processed (${ total } variants)\r` )

    }

    console.log( `\n  Done. ${ total } variant files generated/verified.` )

}

async function main() {

    // If invoked with --variants-only, just regenerate variants from existing covers
    if( process.argv.includes( `--variants-only` ) ) {
        return regenerate_all_variants()
    }

    const existing = load_existing_catalog()

    // Pre-download: validate existing epubs and purge corrupt/empty ones
    const purged_ids = await scan_and_purge_corrupt_epubs()
    for( const id of purged_ids ) existing.delete( id )

    const use_pages = PAGES > 0
    const target_label = use_pages ? `${ PAGES } pages` : `${ MIN_BOOKS } books minimum`

    console.log( `Fetching Gutenberg catalog (${ target_label })...` )

    let fetched_books = []
    let next_url = BASE_URL
    let page = 0

    while( next_url ) {

        page++
        console.log( `  Page ${ page }: ${ next_url }` )

        const data = await fetch_page( next_url )
        fetched_books = fetched_books.concat( data.results )

        // Check stop condition
        if( use_pages && page >= PAGES ) break
        if( !use_pages && fetched_books.length >= MIN_BOOKS ) break

        next_url = data.next

        if( !next_url ) {
            console.log( `  No more pages available.` )
            break
        }

    }

    console.log( `Fetched ${ fetched_books.length } books across ${ page } pages.` )

    // Download assets and attach cover filenames to book objects
    const excluded_ids = await download_all_assets( fetched_books )

    // Clean up all files for books that exceed the size limit
    if( excluded_ids.size > 0 && existsSync( EPUB_DIR ) ) {
        const files = readdirSync( EPUB_DIR )
        for( const id of excluded_ids ) {
            const pattern = new RegExp( `^${ id }[.\\-]` )
            for( const file of files ) {
                if( pattern.test( file ) ) unlinkSync( resolve( EPUB_DIR, file ) )
            }
        }
        console.log( `Removed files for ${ excluded_ids.size } oversized/failed books.` )
    }

    // Post-download: validate all fetched epubs that exist on disk
    const downloadable = fetched_books.filter( book =>
        !excluded_ids.has( book.id ) && existsSync( resolve( EPUB_DIR, `${ book.id }.epub` ) )
    )

    if( downloadable.length > 0 ) {

        console.log( `\nValidating ${ downloadable.length } downloaded epub files...` )
        let post_corrupt = 0

        for( let i = 0; i < downloadable.length; i += DOWNLOAD_CONCURRENCY ) {

            const batch = downloadable.slice( i, i + DOWNLOAD_CONCURRENCY )

            const results = await Promise.all( batch.map( async book => {
                const epub_path = resolve( EPUB_DIR, `${ book.id }.epub` )
                const valid = await validate_epub( epub_path )
                return { id: book.id, valid }
            } ) )

            for( const { id, valid } of results ) {
                if( !valid ) {
                    delete_book_files( id )
                    excluded_ids.add( id )
                    post_corrupt++
                }
            }

            const progress = Math.min( i + DOWNLOAD_CONCURRENCY, downloadable.length )
            process.stdout.write( `  Validated: ${ progress }/${ downloadable.length } (${ post_corrupt } corrupt)\r` )

        }

        if( post_corrupt > 0 ) {
            console.log( `\n  Removed ${ post_corrupt } corrupt epub(s) from this download batch.` )
        } else {
            console.log( `\n  All ${ downloadable.length } downloaded epubs are valid.` )
        }

    }

    // Merge: new books update existing entries, existing-only books are preserved
    // Books that exceeded the size limit are excluded entirely
    for( const book of fetched_books ) {
        if( excluded_ids.has( book.id ) ) {
            existing.delete( book.id )
        } else {
            existing.set( book.id, book )
        }
    }

    // Final pass: drop any catalog entry whose epub is missing on disk
    for( const [ id ] of existing ) {
        if( !existsSync( resolve( EPUB_DIR, `${ id }.epub` ) ) ) existing.delete( id )
    }

    const merged = [ ...existing.values() ]

    console.log( `Catalog: ${ merged.length } total (${ fetched_books.length } fetched, ${ merged.length - fetched_books.length } preserved from previous runs).` )

    writeFileSync( OUTPUT_PATH, JSON.stringify( merged, null, 2 ) )
    console.log( `Written to ${ OUTPUT_PATH }` )

}

main().catch( err => {
    console.error( `Fatal:`, err.message )
    process.exit( 1 )
} )
