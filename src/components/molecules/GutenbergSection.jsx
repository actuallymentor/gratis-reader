import { useState, useCallback, useMemo, useDeferredValue } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Check, ChevronRight, SearchX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { log } from 'mentie'
import { use_gutenberg } from '../../hooks/use_gutenberg.js'
import { use_library_store } from '../../stores/library_store.js'
import { parse_epub } from '../../modules/epub_parser.js'
import { offer_parsed_book } from '../../modules/book_handoff.js'
import GutenbergCard from './GutenbergCard.jsx'
import GutenbergInfoModal from './GutenbergInfoModal.jsx'
import Skeleton from '../atoms/Skeleton.jsx'
import { Button } from '../atoms/Button.jsx'
import LoadError from './LoadError.jsx'

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
    min-height: 2.5rem;
    padding: var(--space-s) var(--space-m);
    margin-top: var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--field-bg);
    color: var(--text);
    font: inherit;
    font-size: 0.95rem;

    &::placeholder { color: var(--text-muted); }
    &:focus-visible { border-color: var(--accent); }
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

const Arrow = styled( ChevronRight )`
    width: 1rem;
    height: 1rem;
    transition: transform 0.2s var(--ease-out);
    transform: rotate( ${ p => p.$open ? `90deg` : `0deg` } );
`

const PillList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
    margin-top: var(--space-xs);
`

// Active filter: tint, border and a check mark, so the state never rests on colour alone
const Pill = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.3em;
    background: ${ p => p.$active ? `var(--accent-light)` : `var(--bg-hover)` };
    color: ${ p => p.$active ? `var(--text)` : `var(--text-muted)` };
    border: 1px solid ${ p => p.$active ? `var(--accent)` : `transparent` };
    border-radius: 999px;
    padding: var(--space-xs) var(--space-m);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background var(--duration-press) ease, color var(--duration-press) ease;
    white-space: nowrap;

    svg { width: 0.875rem; height: 0.875rem; }

    &:hover { background: ${ p => p.$active ? `var(--accent-light)` : `var(--border)` }; }
`

const NoResults = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-s);
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-2xl) 0;

    > svg { width: 1.5rem; height: 1.5rem; color: var(--accent); }
`

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-s);

    @media (min-width: 600px) { gap: var(--space-l); }

    @media (min-width: 768px) {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
`

// Loading placeholders shaped like the cards they stand in for
const SkeletonCard = styled( Skeleton )`
    height: 7.75rem;
    border-radius: var(--radius-m);

    @media (min-width: 600px) { height: 23.75rem; }
`

// Strip "Category: " prefix from bookshelf names
const clean_shelf = name => name.replace( /^Category:\s*/i, `` )

/**
 * Browsable section of public domain books from the Gutenberg catalog
 */
export default function GutenbergSection() {

    const navigate = useNavigate()
    const { books: catalog, loading, error: catalog_error, retry: retry_catalog } = use_gutenberg()
    const { books: library_books, add_book } = use_library_store( useShallow( ( { books, add_book } ) => ( { books, add_book } ) ) )
    const [ info_book, set_info_book ] = useState( null )
    const [ importing_id, set_importing_id ] = useState( null )
    const [ search, set_search ] = useState( `` )
    // Keep typing responsive: the grid re-filters with the deferred value
    const deferred_search = useDeferredValue( search )
    const [ active_shelf, set_active_shelf ] = useState( null )
    const [ shelves_open, set_shelves_open ] = useState( false )

    // Deduplicated, sorted list of all bookshelves across the catalog
    const all_shelves = useMemo( () => {
        const shelf_set = new Set()
        for( const book of catalog ) {
            for( const shelf of book.bookshelves || [] ) shelf_set.add( clean_shelf( shelf ) )
        }
        return [ ...shelf_set ].sort()
    }, [ catalog ] )

    // Lower-case search fields once per catalogue instead of per keystroke
    const searchable_catalog = useMemo( () => catalog.map( book => ( {
        book,
        title: book.title?.toLowerCase() || ``,
        author: book.authors?.[0]?.name?.toLowerCase() || ``,
        summary: book.summaries?.[0]?.toLowerCase() || ``,
        shelves: ( book.bookshelves || [] ).map( clean_shelf )
    } ) ), [ catalog ] )

    // Filter by active bookshelf first, then rank by search query
    const filtered_catalog = useMemo( () => {

        // Start with bookshelf filter
        const base = active_shelf
            ? searchable_catalog.filter( entry => entry.shelves.includes( active_shelf ) )
            : searchable_catalog

        const q = deferred_search.toLowerCase().trim()
        if( !q ) return base.map( entry => entry.book )

        const title_matches = []
        const author_matches = []
        const summary_matches = []

        for( const { book, title, author, summary } of base ) {
            if( title.includes( q ) ) title_matches.push( book )
            else if( author.includes( q ) ) author_matches.push( book )
            else if( summary.includes( q ) ) summary_matches.push( book )
        }

        return [ ...title_matches, ...author_matches, ...summary_matches ]
    }, [ searchable_catalog, deferred_search, active_shelf ] )

    // Gutenberg ids already in the user's library
    const imported_ids = useMemo(
        () => new Set( library_books.map( b => b.id ) ),
        [ library_books ]
    )

    // Import a gutenberg book or open it if already imported
    const handle_read = useCallback( async ( book ) => {

        const book_id = `book_gutenberg_${ book.id }`

        // Already imported — navigate directly
        if( library_books.some( b => b.id === book_id ) ) {
            navigate( `/read/${ book_id }` )
            return
        }

        set_importing_id( book.id )
        let parsed = null
        let handed_off = false

        try {

            // Fetch the epub from static assets
            const response = await fetch( `/gutenberg_epubs/${ book.id }.epub` )
            if( !response.ok ) throw new Error( `Failed to fetch epub` )

            // Vite's SPA fallback serves index.html (text/html) for missing files instead of 404
            const content_type = response.headers.get( `content-type` ) || ``
            if( !content_type.includes( `epub` ) && !content_type.includes( `octet-stream` ) ) {
                throw new Error( `Unexpected content type: ${ content_type }` )
            }

            const array_buffer = await response.arrayBuffer()
            parsed = await parse_epub( array_buffer )
            const { metadata, cover_url } = parsed

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
                title: metadata?.title || book.title,
                author: metadata?.creator || book.authors?.[0]?.name || `Unknown`,
                language: metadata?.language || book.languages?.[0] || `en`,
                cover_image: cover_blob,
                file: new Blob( [ array_buffer ], { type: `application/epub+zip` } ),
                added_at: new Date().toISOString()
            }

            await add_book( book_record )
            toast.success( `Added "${ book_record.title }"` )
            // The reader opens next: let it reuse this parse instead of re-reading the blob
            offer_parsed_book( book_id, { parsed, array_buffer } )
            handed_off = true
            navigate( `/read/${ book_id }` )

        } catch ( error ) {
            log.error( `Failed to import Gutenberg book:`, error )
            toast.error( `Could not load this book` )
        } finally {
            if( !handed_off ) parsed?.book?.destroy()
            set_importing_id( null )
        }

    }, [ library_books, add_book, navigate ] )

    if( loading ) {
        return <Section>
            <SectionHeader>
                <SectionTitle>Classic Library</SectionTitle>
            </SectionHeader>
            <Grid aria-busy="true" aria-label="Loading the classic library">
                { Array.from( { length: 6 } ).map( ( _, i ) =>
                    <SkeletonCard key={ i } />
                ) }
            </Grid>
        </Section>
    }

    if( catalog_error && !catalog.length ) return <Section>
        <SectionHeader>
            <SectionTitle>Classic Library</SectionTitle>
        </SectionHeader>
        <LoadError title="Couldn't load the classic library" error={ catalog_error } on_retry={ retry_catalog } />
    </Section>

    if( !catalog.length ) return null

    return <Section id="classic-library">

        <SectionHeader>
            <SectionTitle>Classic Library</SectionTitle>
            <SectionSubtitle>
                { catalog.length } public domain books from Project Gutenberg
            </SectionSubtitle>
            <SearchInput
                type="search"
                aria-label="Search the classic library"
                placeholder="Search by title, author, or keyword…"
                value={ search }
                onChange={ e => set_search( e.target.value ) }
            />
            { all_shelves.length > 0 && <>
                <PillToggle aria-expanded={ shelves_open } onClick={ () => set_shelves_open( !shelves_open ) }>
                    <Arrow $open={ shelves_open } strokeWidth={ 1.5 } aria-hidden="true" />
                    Browse by category{ active_shelf ? `: ${ active_shelf }` : `` }
                </PillToggle>
                { shelves_open && <PillList>
                    { all_shelves.map( shelf =>
                        <Pill
                            key={ shelf }
                            $active={ active_shelf === shelf }
                            aria-pressed={ active_shelf === shelf }
                            onClick={ () => set_active_shelf( active_shelf === shelf ? null : shelf ) }
                        >
                            { active_shelf === shelf && <Check strokeWidth={ 1.5 } aria-hidden="true" /> }
                            { shelf }
                        </Pill>
                    ) }
                </PillList> }
            </> }
        </SectionHeader>

        { filtered_catalog.length === 0 && ( search || active_shelf ) && <NoResults>
            <SearchX strokeWidth={ 1.5 } aria-hidden="true" />
            <p>No books matching { search ? `"${ search }"` : `` }{ search && active_shelf ? ` in ` : `` }{ active_shelf || `` }</p>
            <Button onClick={ () => {
                set_search( `` )
                set_active_shelf( null )
            } }
            >
                Clear search
            </Button>
        </NoResults> }

        { filtered_catalog.length > 0 && <Grid>
            { filtered_catalog.map( book =>
                <GutenbergCard
                    key={ book.id }
                    book={ book }
                    on_info={ set_info_book }
                    on_read={ handle_read }
                    is_importing={ importing_id === book.id }
                    is_imported={ imported_ids.has( `book_gutenberg_${ book.id }` ) }
                />
            ) }
        </Grid> }

        { info_book && <GutenbergInfoModal
            book={ info_book }
            on_close={ () => set_info_book( null ) }
        /> }

    </Section>

}
