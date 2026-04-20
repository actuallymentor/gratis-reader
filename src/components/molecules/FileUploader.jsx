import { useState, useRef, useCallback } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { log } from 'mentie'
import { parse_epub, hash_buffer } from '../../modules/epub_parser.js'
import { use_library_store } from '../../stores/library_store.js'

const DropZone = styled.div`
    border: 2px dashed ${ p => p.$active ? `var(--accent)` : `var(--border)` };
    border-radius: var(--radius-l);
    padding: var(--space-2xl);
    text-align: center;
    cursor: pointer;
    transition: all 0.2s ease;
    background: ${ p => p.$active ? `var(--accent-light)` : `transparent` };

    &:hover {
        border-color: var(--accent);
        background: var(--accent-light);
    }
`

const DropText = styled.p`
    color: var(--text-muted);
    margin-bottom: var(--space-s);
`

const DropAccent = styled.span`
    color: var(--accent);
    font-weight: 600;
`

const HiddenInput = styled.input`
    display: none;
`

/**
 * Drag-and-drop file upload zone for EPUB files
 * @param {Object} props
 * @param {Function} [props.on_upload_complete] - Called after successful upload
 */
export default function FileUploader( { on_upload_complete } ) {

    const [ is_active, set_is_active ] = useState( false )
    const [ is_uploading, set_is_uploading ] = useState( false )
    const input_ref = useRef( null )
    // Counter tracks nested drag enter/leave events from child elements to prevent flicker
    const drag_counter = useRef( 0 )
    const add_book = use_library_store( state => state.add_book )

    const process_file = useCallback( async ( file ) => {

        if( !file.name.toLowerCase().endsWith( `.epub` ) ) {
            toast.error( `Only EPUB files are supported` )
            return
        }

        // Reject excessively large files to prevent browser memory exhaustion
        const MAX_FILE_SIZE = 200 * 1024 * 1024
        if( file.size > MAX_FILE_SIZE ) {
            toast.error( `File is too large (max 200 MB)` )
            return
        }

        set_is_uploading( true )

        try {
            const array_buffer = await file.arrayBuffer()
            const book_hash = await hash_buffer( array_buffer )

            // Parse to extract metadata
            const { metadata, cover_url } = await parse_epub( array_buffer )

            // Convert cover URL to blob if available
            let cover_blob = null
            if( cover_url ) {
                try {
                    const response = await fetch( cover_url )
                    if( response.ok ) cover_blob = await response.blob()
                } catch ( error ) {
                    log.debug( `Could not fetch cover blob:`, error.message )
                }
            }

            // Create book record
            const book_record = {
                id: `book_${ book_hash }`,
                title: metadata.title || file.name.replace( /\.epub$/i, `` ),
                author: metadata.creator || `Unknown`,
                language: metadata.language || `en`,
                cover_image: cover_blob,
                file: new Blob( [ array_buffer ], { type: `application/epub+zip` } ),
                added_at: new Date().toISOString()
            }

            await add_book( book_record )
            toast.success( `Added "${ book_record.title }"` )
            log.info( `Book uploaded:`, book_record.title )

            if( on_upload_complete ) on_upload_complete( book_record )

        } catch ( error ) {
            log.error( `Failed to process EPUB:`, error )
            toast.error( `Could not read this file` )
        } finally {
            set_is_uploading( false )
        }

    }, [ add_book, on_upload_complete ] )

    const handle_drop = useCallback( ( e ) => {
        e.preventDefault()
        drag_counter.current = 0
        set_is_active( false )
        if( is_uploading ) return
        const file = e.dataTransfer?.files?.[0]
        if( file ) process_file( file )
    }, [ process_file, is_uploading ] )

    const handle_file_input = useCallback( ( e ) => {
        if( is_uploading ) return
        const file = e.target.files?.[0]
        if( file ) process_file( file )
    }, [ process_file, is_uploading ] )

    return <>
        <DropZone
            $active={ is_active }
            onClick={ () => input_ref.current?.click() }
            onDragOver={ ( e ) => e.preventDefault() }
            onDragEnter={ ( e ) => {
                e.preventDefault()
                drag_counter.current++
                set_is_active( true )
            } }
            onDragLeave={ () => {
                drag_counter.current--
                if( drag_counter.current <= 0 ) {
                    drag_counter.current = 0
                    set_is_active( false )
                }
            } }
            onDrop={ handle_drop }
        >
            { is_uploading
                ? <DropText>Processing...</DropText>
                : <>
                    <DropText>
                        Drop an EPUB file here, or <DropAccent>browse</DropAccent>
                    </DropText>
                    <DropText style={ { fontSize: `0.8em` } }>
                        Supports .epub files
                    </DropText>
                </> }
        </DropZone>

        <HiddenInput
            ref={ input_ref }
            type="file"
            accept=".epub"
            onChange={ handle_file_input }
        />
    </>

}
