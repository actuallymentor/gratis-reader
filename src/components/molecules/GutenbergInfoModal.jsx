import styled from 'styled-components'
import Modal from '../atoms/Modal.jsx'

const BookAuthor = styled.p`
    margin-bottom: var(--space-l);
    color: var(--text-muted);
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

    const authors_display = book.authors?.map( a => {
        let { name } = a
        if( a.birth_year || a.death_year ) {
            name += ` (${ a.birth_year || `?` }–${ a.death_year || `?` })`
        }
        return name
    } ).join( `, ` ) || `Unknown`

    const summary = book.summaries?.[0] || `No summary available.`

    return <Modal title={ book.title } width="40rem" on_close={ on_close }>

        <BookAuthor>{ authors_display }</BookAuthor>

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

    </Modal>

}
