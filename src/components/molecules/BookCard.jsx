import { useMemo, useEffect } from 'react'
import styled from 'styled-components'

const Card = styled.div`
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    overflow: hidden;
    cursor: pointer;
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

    img {
        width: 100%;
        height: 100%;
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

const Info = styled.div`
    padding: var(--space-m);
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
`

const DeleteButton = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 0.75em;
    padding: var(--space-xs) var(--space-m);
    width: 100%;
    text-align: center;
    border-top: 1px solid var(--border);
    min-height: 44px;

    &:hover {
        background: var(--bg-hover);
        color: #e53e3e;
    }
`

/**
 * Library book card display
 * @param {Object} props
 * @param {Object} props.book - { id, title, author, cover_image }
 * @param {Function} props.on_open
 * @param {Function} props.on_delete
 */
export default function BookCard( { book, on_open, on_delete } ) {

    // Create and revoke object URL to prevent memory leaks
    const cover_url = useMemo( () => {
        if( book.cover_image ) return URL.createObjectURL( book.cover_image )
        return null
    }, [ book.cover_image ] )

    useEffect( () => {
        return () => {
            if( cover_url ) URL.revokeObjectURL( cover_url )
        }
    }, [ cover_url ] )

    return <Card>
        <div onClick={ on_open } style={ { flex: 1 } }>
            <Cover>
                { cover_url
                    ? <img src={ cover_url } alt={ book.title } />
                    : <CoverPlaceholder>{ book.title }</CoverPlaceholder> }
            </Cover>

            <Info>
                <Title>{ book.title }</Title>
                <Author>{ book.author || `Unknown author` }</Author>
            </Info>
        </div>

        <DeleteButton onClick={ ( e ) => {
            e.stopPropagation(); on_delete()
        } }
        >
            Remove
        </DeleteButton>
    </Card>

}
