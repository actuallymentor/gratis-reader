#!/usr/bin/env node

import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, statSync, unlinkSync } from 'fs'
import { resolve, dirname, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

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

async function fetch_page( url ) {

    const response = await fetch( url )

    if( !response.ok ) {
        throw new Error( `HTTP ${ response.status } fetching ${ url }` )
    }

    const data = await response.json()
    validate_response( data, url )

    return data

}

async function download_file( url, filepath ) {

    const response = await fetch( url )

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

function derive_epub_alternatives( primary_url ) {

    // Gutenberg epub URLs follow: /ebooks/{id}.epub3.images
    // Derive noimages and older-format variants, ordered smallest-first
    const match = primary_url.match( /^(.+\/ebooks\/\d+)\..+$/ )
    if( !match ) return []

    const base = match[1]
    return [
        `${ base }.epub3.noimages`,
        `${ base }.epub.noimages`,
        `${ base }.epub.images`,
        `${ base }.epub3.images`,
    ].filter( url => url !== primary_url )

}

async function try_epub_under_limit( primary_url, epub_path ) {

    for( const url of derive_epub_alternatives( primary_url ) ) {

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
    if( epub_url ) {

        const epub_path = resolve( EPUB_DIR, `${ book.id }.epub` )

        if( existsSync( epub_path ) ) {

            if( statSync( epub_path ).size <= MAX_EPUB_BYTES ) {
                result.epub_skipped = true
            } else {
                unlinkSync( epub_path )
                const found = await try_epub_under_limit( epub_url, epub_path )
                if( !found ) {
                    result.epub_too_large = true
                    return result
                }
            }

        } else {

            const ok = await download_file( epub_url, epub_path )

            if( !ok ) {
                result.epub_failed = true
            } else if( statSync( epub_path ).size > MAX_EPUB_BYTES ) {
                unlinkSync( epub_path )
                const found = await try_epub_under_limit( epub_url, epub_path )
                if( !found ) {
                    result.epub_too_large = true
                    return result
                }
            }

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

    const too_large_ids = new Set()
    let epub_downloaded = 0
    let epub_skipped = 0
    let epub_too_large = 0
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
            if( result.status !== `fulfilled` ) continue
            const v = result.value

            if( v.epub_too_large ) {
                epub_too_large++
                too_large_ids.add( v.id )
            } else if( v.epub_skipped ) epub_skipped++
            else if( !v.epub_failed ) epub_downloaded++

            if( v.cover_skipped ) cover_skipped++
            else if( v.cover_filename ) cover_downloaded++

            if( v.variants ) variants_generated += v.variants.length

            // Attach cover filename to book object
            const book = books.find( b => b.id === v.id )
            if( book && v.cover_filename ) book.cover = v.cover_filename
        }

        const progress = Math.min( i + DOWNLOAD_CONCURRENCY, books.length )
        process.stdout.write( `  Progress: ${ progress }/${ books.length } | epubs: ${ epub_downloaded } new, ${ epub_skipped } cached, ${ epub_too_large } too large | covers: ${ cover_downloaded } new, ${ cover_skipped } cached\r` )

    }

    console.log( `\n  Done. Epubs: ${ epub_downloaded } new, ${ epub_skipped } cached, ${ epub_too_large } skipped (>${ MAX_EPUB_BYTES / 1024 / 1024 } MiB). Covers: ${ cover_downloaded } new, ${ cover_skipped } cached. Variants: ${ variants_generated } generated.` )

    return too_large_ids

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
    const too_large_ids = await download_all_assets( fetched_books )

    // Clean up all files for books that exceed the size limit
    if( too_large_ids.size > 0 && existsSync( EPUB_DIR ) ) {
        const files = readdirSync( EPUB_DIR )
        for( const id of too_large_ids ) {
            const pattern = new RegExp( `^${ id }[.\\-]` )
            for( const file of files ) {
                if( pattern.test( file ) ) unlinkSync( resolve( EPUB_DIR, file ) )
            }
        }
        console.log( `Removed files for ${ too_large_ids.size } oversized books.` )
    }

    // Merge: new books update existing entries, existing-only books are preserved
    // Books that exceeded the size limit are excluded entirely
    for( const book of fetched_books ) {
        if( too_large_ids.has( book.id ) ) {
            existing.delete( book.id )
        } else {
            existing.set( book.id, book )
        }
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
