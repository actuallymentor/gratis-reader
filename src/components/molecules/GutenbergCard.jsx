import { useState } from 'react'
import styled from 'styled-components'

const Card = styled.div`
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: var(--shadow-m);
    }
`

const Cover = styled.div`
    width: 100%;
    aspect-ratio: 2 / 3;
    background: linear-gradient(135deg, var(--accent-light), var(--accent));
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;

    picture, img {
        width: 100%;
        height: 100%;
    }

    img {
        object-fit: cover;
    }
`

const CoverPlaceholder = styled.div`
    font-family: var(--font-heading);
    font-size: 1.2em;
    font-weight: 500;
    color: white;
    text-align: center;
    padding: var(--space-m);
    word-break: break-word;
`

const Body = styled.div`
    padding: var(--space-m);
    flex: 1;
    display: flex;
    flex-direction: column;
`

const Title = styled.h3`
    font-size: 0.95em;
    font-weight: 600;
    margin-bottom: var(--space-xs);
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
`

const Author = styled.p`
    font-size: 0.8em;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: var(--space-xs);
`

const Summary = styled.p`
    font-size: 0.75em;
    color: var(--text-muted);
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    flex: 1;
`

const ButtonRow = styled.div`
    display: flex;
    border-top: 1px solid var(--border);
`

const ActionButton = styled.button`
    flex: 1;
    background: none;
    border: none;
    padding: var(--space-s) var(--space-m);
    font-size: 0.8em;
    font-weight: 500;
    min-height: 44px;
    cursor: pointer;
    color: ${ p => p.$primary ? `var(--accent)` : `var(--text-muted)` };
    transition: background 0.15s ease;

    &:hover {
        background: var(--bg-hover);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    & + & {
        border-left: 1px solid var(--border);
    }
`

/**
 * Card for a Gutenberg catalog book
 * @param {Object} props
 * @param {Object} props.book - Gutenberg catalog entry
 * @param {Function} props.on_info - Opens the detail modal
 * @param {Function} props.on_read - Imports and opens the book for reading
 * @param {boolean} props.is_importing - Whether the book is currently being imported
 * @param {boolean} props.is_imported - Whether the book is already in the user's library
 */
export default function GutenbergCard( { book, on_info, on_read, is_importing, is_imported } ) {

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
                        srcSet={ `${ base }-xs.webp 64w, ${ base }-sm.webp 128w, ${ base }-md.webp 200w` }
                        sizes="(max-width: 480px) 128px, 200px"
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
        </Body>

        <ButtonRow>
            <ActionButton onClick={ on_info }>
                Info
            </ActionButton>
            <ActionButton
                $primary
                onClick={ on_read }
                disabled={ is_importing }
            >
                { is_importing ? `Loading…` : is_imported ? `Open` : `Read` }
            </ActionButton>
        </ButtonRow>

    </Card>

}
