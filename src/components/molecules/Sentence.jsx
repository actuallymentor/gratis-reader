import { memo, useId, useRef } from 'react'
import styled from 'styled-components'
import Skeleton from '../atoms/Skeleton.jsx'
import ReaderWordTooltip from './ReaderWordTooltip.jsx'
import { segment_translation_text } from '../../modules/translation_alignment.js'

const lookup_unavailable = `Translation unavailable`

// Words are plain spans styled from the sentence: a styled-component instance per
// word costs a hook call and class resolution for thousands of words per chapter.
const SentenceSpan = styled.span`
    position: relative;

    & [data-translation-word-index] {
        position: relative;
        border-radius: 2px;
        color: inherit;
        cursor: pointer;
        scroll-margin-bottom: calc(var(--reader-dock-height, 0px) + var(--space-m));
        text-decoration-line: none;
        text-decoration-thickness: 2px;
        text-underline-offset: 0.15em;
        touch-action: manipulation;
    }

    & [data-translation-word-index][aria-pressed="true"] {
        text-decoration-line: underline;
    }

    & [data-translation-word-index]:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }
`

const ACTIVATION_KEYS = [ `Enter`, ` `, `Spacebar` ]

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
function Sentence( {
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
    if( !translated ) return <SentenceSpan data-sentence-id={ sentence_id }>
        { segment_translation_text( original ).map( ( segment, index ) => segment.is_word
            ? <span key={ index } data-reading-word={ segment.text } data-reading-word-index={ segment.word_index }>{ segment.text }</span>
            : segment.text ) }
    </SentenceSpan>

    const segments = segment_translation_text( translated )

    // One delegated handler per sentence instead of two closures per word.
    const activate_word = ( e ) => {
        if( !on_select_word ) return
        if( e.type === `keydown` && !ACTIVATION_KEYS.includes( e.key ) ) return

        const element = e.target.closest( `[data-translation-word-index]` )
        if( !element || !e.currentTarget.contains( element ) ) return

        e.preventDefault()
        e.stopPropagation()

        on_select_word( {
            sentence_id,
            word_index: Number( element.dataset.translationWordIndex ),
            word: element.dataset.translationWord,
            element
        } )
    }

    const tooltip_content = word_lookup?.content
        || ( !word_lookup?.can_lookup || word_lookup?.error ? lookup_unavailable : `...` )

    const rendered_segments = segments.map( ( segment, index ) => {
        if( !segment.is_word ) return segment.text

        const selected = segment.word_index === selected_word_index

        return <span
            key={ `${ index }-${ segment.word_index }` }
            ref={ selected ? selected_word_ref : null }
            role="button"
            tabIndex={ 0 }
            aria-pressed={ selected }
            aria-describedby={ selected ? tooltip_id : undefined }
            aria-label={ `Translate ${ segment.text } and show its word-by-word translation` }
            data-reading-word={ segment.text }
            data-reading-word-index={ segment.word_index }
            data-translation-word={ segment.text }
            data-translation-word-index={ segment.word_index }
        >
            { segment.text }
        </span>
    } )

    return <SentenceSpan data-sentence-id={ sentence_id } onClick={ activate_word } onKeyDown={ activate_word }>
        { rendered_segments }
        { selected_word_index !== null && <ReaderWordTooltip
            anchor_ref={ selected_word_ref }
            anchor_key={ selected_word_index }
            id={ tooltip_id }
            content={ word_lookup?.loading ? `...` : tooltip_content }
        /> }
    </SentenceSpan>

}

// Turbo cache updates must not rebuild every word span in the chapter.
export default memo( Sentence )
