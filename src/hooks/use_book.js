import { useState, useEffect, useCallback, useRef } from 'react'
import { log } from 'mentie'
import { get_book, save_book, delete_book } from '../modules/cache.js'
import { parse_epub, extract_chapter_content, hash_buffer } from '../modules/epub_parser.js'

/**
 * Hook that loads a book from IndexedDB and provides navigation
 * @param {string} book_id
 * @returns {{ book_meta, chapters, current_chapter, current_chapter_content, go_to_chapter, next_chapter, prev_chapter, progress, loading, book_hash }}
 */
export const use_book = ( book_id ) => {

    const [ book_meta, set_book_meta ] = useState( null )
    const [ epub_data, set_epub_data ] = useState( null )
    const [ current_chapter, set_current_chapter ] = useState( 0 )
    const [ current_chapter_content, set_current_chapter_content ] = useState( null )
    const [ ahead_chapters_content, set_ahead_chapters_content ] = useState( [] )
    const [ loading, set_loading ] = useState( true )
    const [ chapter_loading, set_chapter_loading ] = useState( false )
    const [ chapter_error, set_chapter_error ] = useState( null )
    const book_hash_ref = useRef( null )

    // Load and parse the book
    useEffect( () => {

        let cancelled = false

        const load = async () => {
            try {
                set_loading( true )
                const book_record = await get_book( book_id )

                // If the effect was cancelled (StrictMode cleanup), bail silently
                if( cancelled ) return

                // If the book doesn't exist in IndexedDB, stop loading
                if( !book_record ) {
                    set_loading( false )
                    return
                }

                set_book_meta( book_record )

                // Parse the EPUB — if it fails or has an empty spine, Gutenberg books self-heal from static assets
                let array_buffer = await book_record.file.arrayBuffer()
                let parsed = null

                try {
                    parsed = await parse_epub( array_buffer )
                } catch ( parse_error ) {
                    log.debug( `Initial parse failed:`, parse_error.message )
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
                            if( cancelled ) return

                            if( fresh_parsed.spine.length > 0 ) {
                                const updated = { ...book_record, file: new Blob( [ fresh_buffer ], { type: `application/epub+zip` } ) }
                                await save_book( updated )
                                array_buffer = fresh_buffer
                                parsed = fresh_parsed
                                log.info( `Re-imported Gutenberg book with ${ fresh_parsed.spine.length } spine items` )
                            }
                        }
                    } catch ( heal_error ) {
                        log.debug( `Self-heal failed:`, heal_error.message )
                    }
                }

                // If still broken after self-heal, remove the stale IndexedDB entry so the user can re-import
                if( ( !parsed || parsed.spine.length === 0 ) && gutenberg_match ) {
                    log.info( `Removing stale IndexedDB entry for ${ book_id }` )
                    await delete_book( book_id ).catch( () => {} )
                }

                if( !parsed || parsed.spine.length === 0 ) {
                    log.error( `Book has no readable content` )
                    set_loading( false )
                    return
                }

                book_hash_ref.current = await hash_buffer( array_buffer )
                set_epub_data( parsed )
                set_loading( false )

                log.info( `Book loaded:`, parsed.metadata?.title, `with`, parsed.spine.length, `spine items` )

            } catch ( error ) {
                log.error( `Failed to load book:`, error )
                set_loading( false )
            }
        }

        load()
        return () => {
            cancelled = true
        }

    }, [ book_id ] )

    // Clean up epubjs Book instance to prevent memory leaks
    useEffect( () => {
        return () => {
            if( epub_data?.book?.destroy ) {
                log.debug( `Destroying epubjs Book instance` )
                epub_data.book.destroy()
            }
        }
    }, [ epub_data ] )

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

                const content = await extract_chapter_content(
                    epub_data.book, spine_item, book_hash_ref.current, current_chapter
                )
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

    }, [ epub_data, current_chapter ] )

    // Pre-fetch next 2 chapters for translation read-ahead
    useEffect( () => {

        if( !epub_data ) return

        let cancelled = false

        const prefetch_ahead = async () => {
            const ahead = []
            const max_ahead = Math.min( current_chapter + 3, epub_data.spine.length )

            for( let i = current_chapter + 1; i < max_ahead; i++ ) {
                try {
                    const spine_item = epub_data.spine[i]
                    if( !spine_item ) continue

                    const content = await extract_chapter_content(
                        epub_data.book, spine_item, book_hash_ref.current, i
                    )
                    if( cancelled ) return
                    ahead.push( content )
                } catch ( error ) {
                    log.debug( `Read-ahead chapter ${ i } failed:`, error.message )
                }
            }

            if( !cancelled ) set_ahead_chapters_content( ahead )
        }

        prefetch_ahead()
        return () => {
            cancelled = true
        }

    }, [ epub_data, current_chapter ] )

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
