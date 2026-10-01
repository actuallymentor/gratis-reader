import styled from 'styled-components'
import { Link } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import ExpandingAction from '../atoms/ExpandingAction.jsx'
import { cover_url_for } from '../../modules/cover_urls.js'

// Phones: a compact row with the cover beside the details. Wider screens: a vertical card.
const Card = styled.article`
    position: relative;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    overflow: hidden;
    transition: background var(--duration-press) ease, transform var(--duration-press) ease, box-shadow var(--duration-press) ease;

    &:hover { background: var(--bg-hover); }

    /* The card clips its corners, so it carries the halo when its link has keyboard focus */
    &:has( > a:focus-visible ) { box-shadow: 0 0 0 5px var(--focus-halo); }

    @media (min-width: 600px) {
        &:hover {
            background: var(--bg-surface);
            transform: translateY(-1px);
            box-shadow: var(--shadow-m);
        }
    }
`

// The card body is one real link box (reachable by Tab); the title keeps its heading role inside it
const OpenLink = styled( Link )`
    display: grid;
    grid-template-columns: 4.5rem 1fr;
    gap: var(--space-m);
    padding: var(--space-s);
    border-radius: inherit;
    color: inherit;
    text-decoration: none;

    &:focus-visible { box-shadow: none; }

    @media (min-width: 600px) {
        grid-template-columns: 1fr;
        gap: 0;
        padding: 0;
    }
`

const Cover = styled.div`
    width: 100%;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius-s);
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

const Info = styled.div`
    min-width: 0;
    padding: var(--space-xs) 2.75rem var(--space-xs) 0;

    @media (min-width: 600px) { padding: var(--space-m) var(--space-m) 3rem; }
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
`

const ActionSlot = styled.div`
    position: absolute;
    right: var(--space-s);
    bottom: var(--space-s);
`

/**
 * A book in the reader's library
 * @param {Object} props
 * @param {Object} props.book - { id, title, author, cover_image }
 * @param {Function} props.on_delete
 */
export default function BookCard( { book, on_delete } ) {

    const cover_url = cover_url_for( book )

    return <Card>
        <OpenLink to={ `/read/${ book.id }` }>
            <Cover>
                { cover_url
                    ? <img src={ cover_url } alt={ book.title } />
                    : <CoverPlaceholder>{ book.title }</CoverPlaceholder> }
            </Cover>

            <Info>
                <Title>{ book.title }</Title>
                <Author>{ book.author || `Unknown author` }</Author>
            </Info>
        </OpenLink>

        <ActionSlot>
            <ExpandingAction icon={ <Trash2 strokeWidth={ 1.5 } /> } label="Remove" onClick={ on_delete } />
        </ActionSlot>
    </Card>

}
