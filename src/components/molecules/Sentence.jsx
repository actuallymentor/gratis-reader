import styled from 'styled-components'
import Skeleton from '../atoms/Skeleton.jsx'
import { segment_translation_text } from '../../modules/translation_alignment.js'

const SentenceSpan = styled.span`
    position: relative;
`

const SelectableWord = styled.span`
    border-radius: 2px;
    color: inherit;
    cursor: pointer;
    scroll-margin-bottom: calc(var(--reader-dock-height, 0px) + var(--space-m));
    touch-action: manipulation;

    ${ p => p.$selected && `
        text-decoration-line: underline;
        text-decoration-thickness: 0.11em;
        text-underline-offset: 0.18em;
    ` }

    &:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }
`

/**
 * Renders one translated fragment as individually selectable words.
 * @param {Object} props
 * @param {string} props.sentence_id - Stable translation-fragment identifier
 * @param {string} props.original - Original source text
 * @param {string} [props.translated] - Adapted target-language text
 * @param {number|null} [props.selected_word_index] - Selected target token index
 * @param {Function} [props.on_select_word] - Receives the selected fragment and word
 * @returns {JSX.Element}
 */
export default function Sentence( {
    sentence_id,
    original,
    translated,
    selected_word_index = null,
    on_select_word
} ) {

    if( !original ) return <Skeleton width="80%" height="1.2em" />
    if( !translated ) return <SentenceSpan data-sentence-id={ sentence_id }>{ original }</SentenceSpan>

    const select_word = ( word, element ) => {
        if( !on_select_word ) return

        on_select_word( {
            sentence_id,
            word_index: word.word_index,
            word: word.text,
            element
        } )
    }

    const activate_word = ( e, word ) => {
        if( e.type === `keydown` && ![ `Enter`, ` `, `Spacebar` ].includes( e.key ) ) return

        e.preventDefault()
        e.stopPropagation()
        select_word( word, e.currentTarget )
    }

    const rendered_segments = segment_translation_text( translated ).map( ( segment, index ) => {
        if( !segment.is_word ) return segment.text

        const selected = segment.word_index === selected_word_index

        return <SelectableWord
            key={ `${ index }-${ segment.word_index }` }
            role="button"
            tabIndex={ 0 }
            $selected={ selected }
            aria-pressed={ selected }
            aria-label={ `Show ${ segment.text } in the simplified original-language fragment` }
            data-translation-word={ segment.text }
            data-translation-word-index={ segment.word_index }
            onClick={ e => activate_word( e, segment ) }
            onKeyDown={ e => activate_word( e, segment ) }
        >
            { segment.text }
        </SelectableWord>
    } )

    return <SentenceSpan data-sentence-id={ sentence_id }>
        { rendered_segments }
    </SentenceSpan>

}
