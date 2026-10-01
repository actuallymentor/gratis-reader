import { memo, Fragment } from 'react'
import styled from 'styled-components'
import Sentence from './Sentence.jsx'

const Paragraph = styled.p`
    margin-bottom: var(--space-l);
    line-height: 1.8;
`

const Heading = styled.div`
    font-family: var(--font-heading);
    font-weight: 500;
    margin: var(--space-xl) 0 var(--space-l);

    &[data-level="1"] { font-size: 1.8em; }
    &[data-level="2"] { font-size: 1.4em; }
    &[data-level="3"] { font-size: 1.2em; }
    &[data-level="4"], &[data-level="5"], &[data-level="6"] { font-size: 1.1em; }
`

const ListContainer = styled.ul`
    margin-bottom: var(--space-l);
    padding-left: var(--space-xl);
    list-style-type: ${ p => p.$ordered ? `decimal` : `disc` };
`

const ListItem = styled.li`
    margin-bottom: var(--space-s);
    line-height: 1.8;
`

const Blockquote = styled.blockquote`
    border-left: 3px solid var(--accent);
    padding-left: var(--space-l);
    margin: var(--space-l) 0;
    color: var(--text-muted);
    font-style: italic;
`

/**
 * Renders one chapter's parsed elements as selectable sentences.
 * Memoised so lookup, token and status updates in the reader chrome do not
 * rebuild the element tree for every sentence in the chapter.
 * @param {Object} props
 * @param {Array} props.elements - Parsed chapter elements
 * @param {Object} props.translations - Sentence id to translated text
 * @param {Object|null} props.translation_selection - { sentence_id, word_index, word } for the selected word
 * @param {Object|null} props.selected_word_lookup - Lookup state for the selected word
 * @param {Function} props.on_select_word - Receives the selected fragment and word
 * @returns {JSX.Element}
 */
function ChapterContent( { elements, translations, translation_selection, selected_word_lookup, on_select_word } ) {

    // Render sentences with inter-sentence spacing via text node
    const render_sentence = ( sentence, index ) => <Fragment key={ sentence.id }>
        { index > 0 && ` ` }
        <Sentence
            sentence_id={ sentence.id }
            original={ sentence.text }
            translated={ translations[sentence.id] }
            selected_word_index={ translation_selection?.sentence_id === sentence.id
                ? translation_selection.word_index
                : null }
            word_lookup={ translation_selection?.sentence_id === sentence.id
                ? selected_word_lookup
                : null }
            on_select_word={ on_select_word }
        />
    </Fragment>

    const render_element = ( element, i ) => {

        switch ( element.type ) {

        case `heading`:
            return <Heading key={ i } data-level={ element.level }>
                { element.sentences.map( render_sentence ) }
            </Heading>

        case `paragraph`:
            return <Paragraph key={ i }>
                { element.sentences.map( render_sentence ) }
            </Paragraph>

        case `unordered_list`:
        case `ordered_list`:
            return <ListContainer key={ i } $ordered={ element.type === `ordered_list` }>
                { element.items.map( ( item, j ) =>
                    <ListItem key={ j }>
                        { item.sentences.map( render_sentence ) }
                    </ListItem>
                ) }
            </ListContainer>

        case `blockquote`:
            return <Blockquote key={ i }>
                { element.sentences.map( render_sentence ) }
            </Blockquote>

        case `image`:
            return <img key={ i } src={ element.src } alt={ element.alt } />

        default:
            return null
        }

    }

    return <>{ elements.map( render_element ) }</>

}

export default memo( ChapterContent )
