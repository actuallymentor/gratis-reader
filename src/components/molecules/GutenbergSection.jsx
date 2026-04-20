import { useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { log } from 'mentie'
import { use_gutenberg } from '../../hooks/use_gutenberg.js'
import { use_library_store } from '../../stores/library_store.js'
import { parse_epub } from '../../modules/epub_parser.js'
import GutenbergCard from './GutenbergCard.jsx'
import GutenbergInfoModal from './GutenbergInfoModal.jsx'
import Skeleton from '../atoms/Skeleton.jsx'

const Section = styled.section`
    margin-top: var(--space-3xl);
`

const SectionHeader = styled.div`
    margin-bottom: var(--space-l);
    padding-bottom: var(--space-m);
    border-bottom: 1px solid var(--border);
`

const SectionTitle = styled.h2`
    font-size: 1.2em;
    color: var(--text);
`

const SectionSubtitle = styled.p`
    font-size: 0.85em;
    color: var(--text-muted);
    margin-top: var(--space-xs);
`

const SearchInput = styled.input`
    width: 100%;
    padding: var(--space-s) var(--space-m);
    margin-top: var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--bg-surface);
    color: var(--text);
    font-size: 0.9em;

    &::placeholder { color: var(--text-muted); }
    &:focus { outline: none; border-color: var(--accent); }
`

const PillToggle = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.82em;
    cursor: pointer;
    padding: var(--space-xs) 0;
    margin-top: var(--space-s);
    display: flex;
    align-items: center;
    gap: var(--space-xs);

    &:hover { color: var(--text); }
`

const Arrow = styled.span`
    display: inline-block;
    transition: transform 0.2s ease;
    transform: rotate( ${ p => p.$open ? `90deg` : `0deg` } );
    font-size: 0.85em;
`

const PillList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
`

const Pill = styled.button`
    background: ${ p => p.$active ? `var(--accent)` : `var(--bg-hover)` };
    color: ${ p => p.$active ? `white` : `var(--text-muted)` };
    border: none;
    border-radius: 999px;
    padding: var(--space-xs) var(--space-m);
    font-size: 0.78em;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    white-space: nowrap;

    &:hover {
        background: ${ p => p.$active ? `var(--accent)` : `var(--border)` };
    }
`

const NoResults = styled.p`
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-2xl) 0;
`

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-l);

    @media (min-width: 768px) {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
`

/**
 * Browsable section of public domain books from the Gutenberg catalog
 */
export default function GutenbergSection() {

    const navigate = useNavigate()
    const { books: catalog, loading } = use_gutenberg()
    const { books: library_books, add_book } = use_library_store()
    const [ info_book, set_info_book ] = useState( null )
    const [ importing_id, set_importing_id ] = useState( null )
    const [ search, set_search ] = useState( `` )
    const [ active_shelf, set_active_shelf ] = useState( null )
    const [ shelves_open, set_shelves_open ] = useState( false )

    // Strip "Category: " prefix from bookshelf names
    const clean_shelf = name => name.replace( /^Category:\s*/i, `` )

    // Deduplicated, sorted list of all bookshelves across the catalog
    const all_shelves = useMemo( () => {
        const shelf_set = new Set()
        for( const book of catalog ) {
            for( const shelf of book.bookshelves || [] ) shelf_set.add( clean_shelf( shelf ) )
        }
        return [ ...shelf_set ].sort()
    }, [ catalog ] )

    // Filter by active bookshelf first, then rank by search query
    const filtered_catalog = useMemo( () => {

        // Start with bookshelf filter
        const base = active_shelf
            ? catalog.filter( book => ( book.bookshelves || [] ).some( s => clean_shelf( s ) === active_shelf ) )
            : catalog

        const q = search.toLowerCase().trim()
        if( !q ) return base

        const title_matches = []
        const author_matches = []
        const summary_matches = []

        for( const book of base ) {
            const title = book.title?.toLowerCase() || ``
            const author = book.authors?.[0]?.name?.toLowerCase() || ``
            const summary = book.summaries?.[0]?.toLowerCase() || ``

            if( title.includes( q ) ) title_matches.push( book )
            else if( author.includes( q ) ) author_matches.push( book )
            else if( summary.includes( q ) ) summary_matches.push( book )
        }

        return [ ...title_matches, ...author_matches, ...summary_matches ]
    }, [ catalog, search, active_shelf ] )

    // Check if a gutenberg book is already in the user's library
    const is_imported = useCallback( ( gutenberg_id ) => {
        return library_books.some( b => b.id === `book_gutenberg_${ gutenberg_id }` )
    }, [ library_books ] )

    // Import a gutenberg book or open it if already imported
    const handle_read = useCallback( async ( book ) => {

        const book_id = `book_gutenberg_${ book.id }`

        // Already imported — navigate directly
        if( library_books.some( b => b.id === book_id ) ) {
            navigate( `/read/${ book_id }` )
            return
        }

        set_importing_id( book.id )

        try {

            // Fetch the epub from static assets
            const response = await fetch( `/gutenberg_epubs/${ book.id }.epub` )
            if( !response.ok ) throw new Error( `Failed to fetch epub` )

            const array_buffer = await response.arrayBuffer()
            const { metadata, cover_url } = await parse_epub( array_buffer )

            // Fetch cover as blob
            let cover_blob = null
            if( cover_url ) {
                try {
                    const cover_response = await fetch( cover_url )
                    if( cover_response.ok ) cover_blob = await cover_response.blob()
                } catch ( err ) {
                    log.debug( `Could not fetch epub cover:`, err.message )
                }
            }

            // Fall back to the static cover image if epub didn't provide one
            if( !cover_blob ) {
                try {
                    const static_cover = await fetch( `/gutenberg_epubs/${ book.id }.jpg` )
                    if( static_cover.ok ) cover_blob = await static_cover.blob()
                } catch ( err ) {
                    log.debug( `Could not fetch static cover:`, err.message )
                }
            }

            const book_record = {
                id: book_id,
                title: metadata.title || book.title,
                author: metadata.creator || book.authors?.[0]?.name || `Unknown`,
                language: metadata.language || book.languages?.[0] || `en`,
                cover_image: cover_blob,
                file: new Blob( [ array_buffer ], { type: `application/epub+zip` } ),
                added_at: new Date().toISOString()
            }

            await add_book( book_record )
            toast.success( `Added "${ book_record.title }"` )
            navigate( `/read/${ book_id }` )

        } catch ( error ) {
            log.error( `Failed to import Gutenberg book:`, error )
            toast.error( `Could not load this book` )
        } finally {
            set_importing_id( null )
        }

    }, [ library_books, add_book, navigate ] )

    if( loading ) {
        return <Section>
            <SectionHeader>
                <SectionTitle>Classic Library</SectionTitle>
            </SectionHeader>
            <Grid>
                { Array.from( { length: 6 } ).map( ( _, i ) =>
                    <Skeleton key={ i } height="380px" />
                ) }
            </Grid>
        </Section>
    }

    if( !catalog.length ) return null

    return <Section>

        <SectionHeader>
            <SectionTitle>Classic Library</SectionTitle>
            <SectionSubtitle>
                { catalog.length } public domain books from Project Gutenberg
            </SectionSubtitle>
            <SearchInput
                type="text"
                placeholder="Search by title, author, or keyword…"
                value={ search }
                onChange={ e => set_search( e.target.value ) }
            />
            { all_shelves.length > 0 && <>
                <PillToggle onClick={ () => set_shelves_open( !shelves_open ) }>
                    <Arrow $open={ shelves_open }>▶</Arrow>
                    Browse by category{ active_shelf ? `: ${ active_shelf }` : `` }
                </PillToggle>
                { shelves_open && <PillList>
                    { all_shelves.map( shelf =>
                        <Pill
                            key={ shelf }
                            $active={ active_shelf === shelf }
                            onClick={ () => set_active_shelf( active_shelf === shelf ? null : shelf ) }
                        >
                            { shelf }
                        </Pill>
                    ) }
                </PillList> }
            </> }
        </SectionHeader>

        { filtered_catalog.length === 0 && ( search || active_shelf ) && <NoResults>
            No books matching { search ? `"${ search }"` : `` }{ search && active_shelf ? ` in ` : `` }{ active_shelf || `` }
        </NoResults> }

        { filtered_catalog.length > 0 && <Grid>
            { filtered_catalog.map( book =>
                <GutenbergCard
                    key={ book.id }
                    book={ book }
                    on_info={ () => set_info_book( book ) }
                    on_read={ () => handle_read( book ) }
                    is_importing={ importing_id === book.id }
                    is_imported={ is_imported( book.id ) }
                />
            ) }
        </Grid> }

        { info_book && <GutenbergInfoModal
            book={ info_book }
            on_close={ () => set_info_book( null ) }
        /> }

    </Section>

}
