import { useState, useEffect, useCallback, useRef } from 'react'
import { log } from 'mentie'
import { get_book } from '../modules/cache.js'
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

                // Parse the EPUB
                const array_buffer = await book_record.file.arrayBuffer()
                const hash = await hash_buffer( array_buffer )
                book_hash_ref.current = hash

                const parsed = await parse_epub( array_buffer )
                if( cancelled ) return

                set_epub_data( parsed )
                set_loading( false )

                log.info( `Book loaded:`, parsed.metadata.title, `with`, parsed.spine.length, `spine items` )

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
