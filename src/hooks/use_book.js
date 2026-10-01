import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { log } from 'mentie'
import {
    get_book, save_book, delete_book,
    get_book_index, save_book_index, get_chapter, save_chapter, delete_chapters
} from '../modules/cache.js'
import {
    parse_epub, load_epubjs, extract_chapter_content, hash_buffer, book_index_from, PARSER_VERSION, HASH_BYTES
} from '../modules/epub_parser.js'
import { take_parsed_book } from '../modules/book_handoff.js'
import { segment_translation_text } from '../modules/translation_alignment.js'

const EMPTY_CHAPTERS = []

// Source words in a parsed chapter, counted once per content object
const count_source_words = content => {
    content.word_count ??= content.elements
        .flatMap( element => element.sentences || element.items?.flatMap( item => item.sentences ) || [] )
        .reduce( ( count, sentence ) => count + segment_translation_text( sentence.text ).filter( segment => segment.is_word ).length, 0 )
    return content.word_count
}

/**
 * Hook that loads a book from IndexedDB and provides navigation.
 * Reopening a book reads its parsed structure and chapters from IndexedDB; the
 * EPUB archive is only opened for chapters that were never parsed before.
 * @param {string} book_id
 * @param {number} ahead_word_budget - Source words needed beyond the current chapter
 * @returns {{ book_meta, chapters, current_chapter, current_chapter_content, go_to_chapter, next_chapter, prev_chapter, progress, loading, book_hash }}
 */
export const use_book = ( book_id, ahead_word_budget = 0 ) => {

    const [ book_meta, set_book_meta ] = useState( null )
    const [ epub_data, set_epub_data ] = useState( null )
    const [ current_chapter, set_current_chapter ] = useState( 0 )
    const [ current_chapter_content, set_current_chapter_content ] = useState( null )
    const [ ahead_content, set_ahead_content ] = useState( null )
    const [ loading, set_loading ] = useState( true )
    const [ chapter_loading, set_chapter_loading ] = useState( false )
    const [ chapter_error, set_chapter_error ] = useState( null )
    const book_hash_ref = useRef( null )

    // Share pending/resolved parses across navigation and changing viewport budgets.
    const chapter_cache = useMemo( () => new Map(), [ epub_data ] )
    const load_chapter_content = useCallback( index => {

        if( !chapter_cache.has( index ) ) {
            // The hash travels with this epub_data: a book switch mid-load must not relabel sentences
            const { book_hash } = epub_data
            const key = `${ book_hash }:${ index }`
            const pending = get_chapter( key ).catch( () => undefined ).then( async cached => {
                if( cached?.parser_version === PARSER_VERSION ) return { elements: cached.elements }

                const book = await epub_data.open_book()
                const content = await extract_chapter_content( book, epub_data.spine[index], book_hash, index )
                save_chapter( { key, parser_version: PARSER_VERSION, elements: content.elements } ).catch( error =>
                    log.debug( `Could not cache chapter ${ index }:`, error.message )
                )
                return content
            } ).catch( error => {
                chapter_cache.delete( index )
                throw error
            } )
            chapter_cache.set( index, pending )
        }

        return chapter_cache.get( index )

    }, [ epub_data, chapter_cache ] )

    // Never expose read-ahead from the previous chapter during navigation.
    const ahead_chapters_content = ahead_content?.epub_data === epub_data
        && ahead_content?.chapter === current_chapter && ahead_word_budget > 0
        ? ahead_content.content
        : EMPTY_CHAPTERS

    // Load the book: cached structure first, otherwise parse the archive
    useEffect( () => {

        let cancelled = false
        const handoff = take_parsed_book( book_id )
        // Whichever archive this effect ends up owning is destroyed on cleanup;
        // archives that arrive after cleanup are destroyed on the spot.
        let opened_book = null
        const adopt = ( book ) => {
            if( cancelled ) {
                book?.destroy?.()
                throw new Error( `Book load cancelled` )
            }
            opened_book = book
            return book
        }
        if( handoff ) adopt( handoff.parsed.book )

        // Opens the epubjs archive at most once, only when a chapter is missing from the cache.
        const lazy_opener = ( book_record, parsed = null ) => {
            let opening = parsed ? Promise.resolve( parsed.book ) : null
            return () => {
                opening ||= book_record.file.arrayBuffer()
                    .then( parse_epub )
                    .then( fresh => adopt( fresh.book ) )
                    .catch( error => {
                        // A transient failure must not poison every later chapter request
                        opening = null
                        throw error
                    } )
                return opening
            }
        }

        const load = async () => {
            try {
                set_loading( true )
                let book_record = await get_book( book_id )

                // If the effect was cancelled (StrictMode cleanup), bail silently
                if( cancelled ) return

                // If the book doesn't exist in IndexedDB, stop loading
                if( !book_record ) {
                    set_loading( false )
                    return
                }

                set_book_meta( book_record )

                // Fast path: structure parsed on an earlier visit of this exact file
                const index = handoff ? null : await get_book_index( book_id ).catch( () => undefined )
                const file_hash = index && await hash_buffer( await book_record.file.slice( 0, HASH_BYTES ).arrayBuffer() )
                if( cancelled ) return

                const index_matches_file = index?.parser_version === PARSER_VERSION
                    && index.book_hash === file_hash && index.file_size === book_record.file.size
                if( index_matches_file ) {
                    book_hash_ref.current = index.book_hash
                    set_epub_data( { ...book_index_from( index ), book_hash: index.book_hash, open_book: lazy_opener( book_record ) } )
                    set_loading( false )
                    log.info( `Book restored:`, index.metadata?.title, `with`, index.spine.length, `spine items` )
                    return
                }

                // Parse the EPUB — if it fails or has an empty spine, Gutenberg books self-heal from static assets
                let array_buffer = handoff?.array_buffer || await book_record.file.arrayBuffer()
                let parsed = handoff?.parsed || null

                if( !parsed ) {
                    // A parser that will not download says nothing about the book: keep it and stop here
                    await load_epubjs()
                    if( cancelled ) return
                    try {
                        parsed = await parse_epub( array_buffer )
                        adopt( parsed.book )
                    } catch ( parse_error ) {
                        if( cancelled ) return
                        log.debug( `Initial parse failed:`, parse_error.message )
                    }
                }
                if( cancelled ) return

                const gutenberg_match = book_id.match( /^book_gutenberg_(\d+)$/ )
                const needs_heal = !parsed || parsed.spine.length === 0

                if( needs_heal && gutenberg_match ) {
                    log.info( `Broken epub for Gutenberg book ${ gutenberg_match[1] }, re-fetching` )
                    try {
                        const response = await fetch( `/gutenberg_epubs/${ gutenberg_match[1] }.epub` )

                        // Vite SPA fallback serves index.html for missing files — check Content-Type
                        const content_type = response.headers.get( `content-type` ) || ``
                        const is_epub = content_type.includes( `epub` ) || content_type.includes( `octet-stream` )

                        if( response.ok && is_epub ) {
                            const fresh_buffer = await response.arrayBuffer()
                            const fresh_parsed = await parse_epub( fresh_buffer )

                            if( fresh_parsed.spine.length > 0 ) {
                                // Own the replacement before anything else can fail or cancel
                                parsed?.book?.destroy()
                                parsed = fresh_parsed
                                adopt( fresh_parsed.book )
                                const updated = { ...book_record, file: new Blob( [ fresh_buffer ], { type: `application/epub+zip` } ) }
                                await save_book( updated )
                                array_buffer = fresh_buffer
                                book_record = updated
                                log.info( `Re-imported Gutenberg book with ${ fresh_parsed.spine.length } spine items` )
                            } else {
                                fresh_parsed.book.destroy()
                            }
                        }
                    } catch ( heal_error ) {
                        if( cancelled ) return
                        log.debug( `Self-heal failed:`, heal_error.message )
                    }
                }
                if( cancelled ) return

                // If still broken after self-heal, remove the stale IndexedDB entry so the user can re-import
                if( ( !parsed || parsed.spine.length === 0 ) && gutenberg_match ) {
                    log.info( `Removing stale IndexedDB entry for ${ book_id }` )
                    await delete_book( book_id ).catch( () => {} )
                }

                if( !parsed || parsed.spine.length === 0 ) {
                    parsed?.book?.destroy()
                    log.error( `Book has no readable content` )
                    set_loading( false )
                    return
                }

                const book_hash = await hash_buffer( array_buffer )
                if( cancelled ) return

                // Same hash but a different file (size changed): the old chapters belong to the old file
                if( index && index.book_hash === book_hash ) await delete_chapters( book_hash ).catch( () => {} )
                if( cancelled ) return

                book_hash_ref.current = book_hash
                const structure = book_index_from( parsed )
                save_book_index( { book_id, book_hash, file_size: book_record.file.size, parser_version: PARSER_VERSION, ...structure } )
                    .catch( error => log.debug( `Could not cache book structure:`, error.message ) )
                set_epub_data( { ...structure, book_hash, open_book: lazy_opener( book_record, parsed ) } )
                set_loading( false )

                log.info( `Book loaded:`, parsed.metadata?.title, `with`, parsed.spine.length, `spine items` )

            } catch ( error ) {
                if( cancelled ) return
                log.error( `Failed to load book:`, error )
                set_loading( false )
            }
        }

        load()
        return () => {
            cancelled = true
            // Clean up the epubjs Book instance to prevent memory leaks
            if( opened_book?.destroy ) {
                log.debug( `Destroying epubjs Book instance` )
                opened_book.destroy()
            }
        }

    }, [ book_id ] )

    // Load chapter content when chapter changes
    useEffect( () => {

        if( !epub_data ) return

        let cancelled = false

        const load_chapter = async () => {
            try {
                set_chapter_loading( true )
                set_chapter_error( null )
                const spine_item = epub_data.spine[current_chapter]
                if( !spine_item ) {
                    set_chapter_loading( false )
                    set_chapter_error( `Chapter not found in book spine` )
                    return
                }

                const content = await load_chapter_content( current_chapter )
                if( cancelled ) return

                set_current_chapter_content( content )
                set_chapter_loading( false )

            } catch ( error ) {
                log.error( `Failed to load chapter ${ current_chapter }:`, error )
                if( !cancelled ) {
                    set_chapter_error( `Failed to load chapter: ${ error.message }` )
                    set_chapter_loading( false )
                }
            }
        }

        load_chapter()
        return () => {
            cancelled = true
        }

    }, [ epub_data, current_chapter, load_chapter_content ] )

    // Parse only enough following chapters to cover the viewport's source-word deficit.
    useEffect( () => {

        if( !epub_data ) return

        let cancelled = false

        const prefetch_ahead = async () => {
            const ahead = []
            let word_count = 0

            // Empty/tiny chapters must not truncate the requested read-ahead window.
            for( let i = current_chapter + 1; i < epub_data.spine.length && word_count < ahead_word_budget && !cancelled; i++ ) {
                try {
                    const spine_item = epub_data.spine[i]
                    if( !spine_item ) continue

                    const content = await load_chapter_content( i )
                    if( cancelled ) return
                    ahead.push( content )
                    word_count += count_source_words( content )
                } catch ( error ) {
                    log.debug( `Read-ahead chapter ${ i } failed:`, error.message )
                }
            }

            if( !cancelled ) set_ahead_content( { epub_data, chapter: current_chapter, content: ahead } )
        }

        prefetch_ahead()
        return () => {
            cancelled = true
        }

    }, [ epub_data, current_chapter, ahead_word_budget, load_chapter_content ] )

    // Navigation
    const go_to_chapter = useCallback( ( index ) => {
        if( epub_data && index >= 0 && index < epub_data.spine.length ) {
            set_current_chapter( index )
        }
    }, [ epub_data ] )

    const next_chapter = useCallback( () => {
        if( epub_data && current_chapter < epub_data.spine.length - 1 ) {
            set_current_chapter( prev => prev + 1 )
        }
    }, [ epub_data, current_chapter ] )

    const prev_chapter = useCallback( () => {
        if( current_chapter > 0 ) {
            set_current_chapter( prev => prev - 1 )
        }
    }, [ current_chapter ] )

    // Progress as percentage (guard against empty spine)
    const progress = epub_data?.spine?.length
        ? Math.round(  ( current_chapter + 1 ) / epub_data.spine.length  * 100 )
        : 0

    return {
        book_meta,
        chapters: epub_data?.toc || [],
        spine: epub_data?.spine || [],
        current_chapter,
        current_chapter_content,
        ahead_chapters_content,
        go_to_chapter,
        next_chapter,
        prev_chapter,
        progress,
        loading,
        chapter_loading,
        chapter_error,
        book_hash: book_hash_ref.current,
        source_language: epub_data?.metadata?.language || `en`
    }

}
