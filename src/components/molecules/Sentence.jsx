import { useId, useRef } from 'react'
import styled from 'styled-components'
import Skeleton from '../atoms/Skeleton.jsx'
import ReaderWordTooltip from './ReaderWordTooltip.jsx'
import { segment_translation_text } from '../../modules/translation_alignment.js'

const lookup_unavailable = `Translation unavailable`

const SentenceSpan = styled.span`
    position: relative;
`

const SelectableWord = styled.span`
    position: relative;
    border-radius: 2px;
    color: inherit;
    cursor: pointer;
    scroll-margin-bottom: calc(var(--reader-dock-height, 0px) + var(--space-m));
    text-decoration-line: ${ p => p.$selected ? `underline` : `none` };
    text-decoration-thickness: 2px;
    text-underline-offset: 0.15em;
    touch-action: manipulation;

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
 * @param {Object} [props.word_lookup] - Lookup state for the selected target word
 * @param {Function} [props.on_select_word] - Receives the selected fragment and word
 * @returns {JSX.Element}
 */
export default function Sentence( {
    sentence_id,
    original,
    translated,
    selected_word_index = null,
    word_lookup,
    on_select_word
} ) {

    const tooltip_id = useId()
    const selected_word_ref = useRef( null )

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

    const tooltip_content = word_lookup?.content
        || ( !word_lookup?.can_lookup || word_lookup?.error ? lookup_unavailable : `...` )

    const rendered_segments = segment_translation_text( translated ).map( ( segment, index ) => {
        if( !segment.is_word ) return segment.text

        const selected = segment.word_index === selected_word_index

        return <SelectableWord
            key={ `${ index }-${ segment.word_index }` }
            ref={ selected ? selected_word_ref : null }
            $selected={ selected }
            role="button"
            tabIndex={ 0 }
            aria-pressed={ selected }
            aria-describedby={ selected ? tooltip_id : undefined }
            aria-label={ `Translate ${ segment.text } and show its word-by-word translation` }
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
        { selected_word_index !== null && <ReaderWordTooltip
            anchor_ref={ selected_word_ref }
            anchor_key={ selected_word_index }
            id={ tooltip_id }
            content={ word_lookup?.loading ? `...` : tooltip_content }
        /> }
    </SentenceSpan>

}
