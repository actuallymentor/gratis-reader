import { memo, useState } from 'react'
import styled from 'styled-components'
import { BookOpen, Info, Loader2 } from 'lucide-react'
import { Button } from '../atoms/Button.jsx'
import ExpandingAction from '../atoms/ExpandingAction.jsx'

// Phones: a compact row with the cover beside the details. Wider screens: a vertical card.
const Card = styled.article`
    display: grid;
    grid-template-columns: 4.5rem 1fr;
    gap: var(--space-m);
    padding: var(--space-s);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    transition: transform var(--duration-press) ease, box-shadow var(--duration-press) ease;

    @media (min-width: 600px) {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr;
        gap: 0;
        padding: 0;
        overflow: hidden;
    }

    @media (min-width: 600px) and (hover: hover) {
        &:hover {
            transform: translateY(-1px);
            box-shadow: var(--shadow-m);
        }
    }
`

const Cover = styled.div`
    width: 100%;
    aspect-ratio: 2 / 3;
    align-self: start;
    border-radius: var(--radius-s);
    background: linear-gradient(135deg, var(--accent-light), var(--accent));
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    picture, img {
        width: 100%;
        height: 100%;
    }

    img { object-fit: cover; }

    @media (min-width: 600px) { border-radius: 0; }
`

const CoverPlaceholder = styled.div`
    font-family: var(--font-heading);
    font-size: 0.75rem;
    color: white;
    text-align: center;
    padding: var(--space-xs);
    word-break: break-word;

    @media (min-width: 600px) {
        font-size: 1.2em;
        padding: var(--space-m);
    }
`

const Body = styled.div`
    min-width: 0;
    display: flex;
    flex-direction: column;

    @media (min-width: 600px) { padding: var(--space-m); }
`

const Title = styled.h3`
    font-size: 1rem;
    font-weight: 500;
    margin-bottom: var(--space-xs);
    color: var(--text);
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
`

const Author = styled.p`
    font-size: 0.85rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: var(--space-xs);
`

const Summary = styled.p`
    font-size: 0.8rem;
    color: var(--text-muted);
    line-height: 1.45;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    flex: 1;

    @media (min-width: 600px) { -webkit-line-clamp: 3; }
`

const ButtonRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-s);
    margin-top: var(--space-s);

    .spin { animation: spin 1s linear infinite; }
`

/**
 * Card for a Gutenberg catalog book
 * @param {Object} props
 * @param {Object} props.book - Gutenberg catalog entry
 * @param {Function} props.on_info - Opens the detail modal, receives the book
 * @param {Function} props.on_read - Imports and opens the book for reading, receives the book
 * @param {boolean} props.is_importing - Whether the book is currently being imported
 * @param {boolean} props.is_imported - Whether the book is already in the user's library
 */
function GutenbergCard( { book, on_info, on_read, is_importing, is_imported } ) {

    const [ cover_failed, set_cover_failed ] = useState( false )
    const author = book.authors?.[0]?.name || `Unknown`
    const summary = book.summaries?.[0] || ``
    const base = `/gutenberg_epubs/${ book.id }`

    return <Card>

        <Cover>
            { !cover_failed
                ? <picture>
                    <source
                        type="image/webp"
                        srcSet={ `${ base }-xs.webp 64w, ${ base }-sm.webp 128w, ${ base }-md.webp 200w, ${ base }-lg.webp 400w` }
                        sizes="(max-width: 599px) 72px, (max-width: 767px) calc((100vw - 5.5rem) / 2), 280px"
                    />
                    <img
                        src={ `${ base }.jpg` }
                        alt={ book.title }
                        loading="lazy"
                        onError={ () => set_cover_failed( true ) }
                    />
                </picture>
                : <CoverPlaceholder>{ book.title }</CoverPlaceholder> }
        </Cover>

        <Body>
            <Title>{ book.title }</Title>
            <Author>{ author }</Author>
            { summary && <Summary>{ summary }</Summary> }
            <ButtonRow>
                <ExpandingAction icon={ <Info strokeWidth={ 1.5 } /> } label="Info" onClick={ () => on_info( book ) } />
                <Button
                    variant="primary"
                    icon={ is_importing ? <Loader2 className="spin" strokeWidth={ 1.5 } aria-hidden="true" /> : <BookOpen strokeWidth={ 1.5 } /> }
                    onClick={ () => on_read( book ) }
                    disabled={ is_importing }
                    aria-live={ is_importing ? `polite` : undefined }
                >
                    { is_importing ? `Loading…` : is_imported ? `Open` : `Read` }
                </Button>
            </ButtonRow>
        </Body>

    </Card>

}

export default memo( GutenbergCard )
