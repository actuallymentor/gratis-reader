import { useEffect } from 'react'
import styled from 'styled-components'

const Overlay = styled.div`
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    z-index: 200;
    animation: fade_in 0.2s ease;

    @keyframes fade_in {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @media (min-width: 768px) {
        align-items: center;
    }
`

const Panel = styled.div`
    background: var(--bg-surface);
    border-radius: var(--radius-l) var(--radius-l) 0 0;
    padding: var(--space-xl);
    max-height: 80vh;
    overflow-y: auto;
    width: 100%;
    max-width: min( 900px, calc( 100vw - var(--space-xl) * 2 ) );
    animation: slide_up 0.3s ease-out;

    @keyframes slide_up {
        from { transform: translateY(100%); }
        to { transform: translateY(0); }
    }

    @media (min-width: 768px) {
        border-radius: var(--radius-l);
        animation: scale_in 0.25s ease-out;

        @keyframes scale_in {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
    }
`

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-l);
    gap: var(--space-m);
`

const TitleGroup = styled.div`
    flex: 1;
`

const BookTitle = styled.h3`
    font-size: 1.2em;
    color: var(--text);
    margin-bottom: var(--space-xs);
`

const BookAuthor = styled.p`
    font-size: 0.9em;
    color: var(--text-muted);
`

const CloseButton = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.5em;
    line-height: 1;
    padding: var(--space-xs);
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-s);
    flex-shrink: 0;

    &:hover {
        background: var(--bg-hover);
        color: var(--text);
    }
`

const Section = styled.div`
    margin-bottom: var(--space-l);
`

const Label = styled.span`
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted);
    display: block;
    margin-bottom: var(--space-xs);
`

const SummaryText = styled.p`
    line-height: 1.7;
    color: var(--text);
    font-size: 0.95em;
`

const TagList = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
`

const Tag = styled.span`
    background: var(--bg-hover);
    color: var(--text-muted);
    font-size: 0.8em;
    padding: var(--space-xs) var(--space-s);
    border-radius: var(--radius-s);
`

const MetaRow = styled.p`
    font-size: 0.9em;
    color: var(--text);
    line-height: 1.6;
`

/**
 * Detail modal for a Gutenberg book
 * @param {Object} props
 * @param {Object} props.book - Gutenberg catalog entry
 * @param {Function} props.on_close - Closes the modal
 */
export default function GutenbergInfoModal( { book, on_close } ) {

    // Close on Escape
    useEffect( () => {
        const handle_key = ( e ) => {
            if( e.key === `Escape` ) on_close()
        }
        window.addEventListener( `keydown`, handle_key )
        return () => window.removeEventListener( `keydown`, handle_key )
    }, [ on_close ] )

    const authors_display = book.authors?.map( a => {
        let { name } = a
        if( a.birth_year || a.death_year ) {
            name += ` (${ a.birth_year || `?` }–${ a.death_year || `?` })`
        }
        return name
    } ).join( `, ` ) || `Unknown`

    const summary = book.summaries?.[0] || `No summary available.`

    return <Overlay onClick={ e => {
        if( e.target === e.currentTarget ) on_close() 
    } }
    >
        <Panel>

            <Header>
                <TitleGroup>
                    <BookTitle>{ book.title }</BookTitle>
                    <BookAuthor>{ authors_display }</BookAuthor>
                </TitleGroup>
                <CloseButton onClick={ on_close } aria-label="Close">×</CloseButton>
            </Header>

            <Section>
                <Label>Summary</Label>
                <SummaryText>{ summary }</SummaryText>
            </Section>

            { book.subjects?.length > 0 && <Section>
                <Label>Subjects</Label>
                <TagList>
                    { book.subjects.map( ( s, i ) => <Tag key={ i }>{ s }</Tag> ) }
                </TagList>
            </Section> }

            { book.bookshelves?.length > 0 && <Section>
                <Label>Bookshelves</Label>
                <TagList>
                    { book.bookshelves.map( ( b, i ) => <Tag key={ i }>{ b }</Tag> ) }
                </TagList>
            </Section> }

            <Section>
                <Label>Details</Label>
                <MetaRow>
                    <strong>Languages:</strong> { book.languages?.join( `, ` ) || `Unknown` }
                </MetaRow>
                <MetaRow>
                    <strong>Downloads:</strong> { book.download_count?.toLocaleString() || `—` }
                </MetaRow>
                { book.copyright === false && <MetaRow>
                    <strong>Copyright:</strong> Public Domain
                </MetaRow> }
            </Section>

        </Panel>
    </Overlay>

}
