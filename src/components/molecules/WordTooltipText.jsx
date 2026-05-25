import { useState, useRef, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import Tooltip from '../atoms/Tooltip.jsx'
import { clean_lookup_word, word_cache_key, use_word_lookup } from '../../hooks/use_word_lookup.js'

const TAP_MAX_MS = 300
const TOOLTIP_DISMISS_MS = 2000
const LOOKUP_UNAVAILABLE = `Lookup unavailable`

const TappableWord = styled.span`
    cursor: pointer;
    border-radius: 2px;

    &:hover {
        color: var(--accent-dark);
    }
`

/**
 * Renders target-language text where one tap on any word shows its source-language equivalent.
 * @param {Object} props
 * @param {string} props.text
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @param {string} [props.sentence_context]
 * @param {number} [props.tap_max_ms]
 */
export default function WordTooltipText( {
    text,
    source_language,
    target_language,
    sentence_context,
    tap_max_ms = TAP_MAX_MS
} ) {

    const [ visible_word, set_visible_word ] = useState( null )
    const container_ref = useRef( null )
    const press_started_at_ref = useRef( null )
    const dismiss_timer_ref = useRef( null )
    const { lookup_word, get_lookup_state } = use_word_lookup( {
        source_language,
        target_language,
        sentence_context: sentence_context || text
    } )

    const remember_press_start = useCallback( () => {
        press_started_at_ref.current = Date.now()
    }, [] )

    const reveal_word = useCallback( ( word ) => {
        const clean_word = clean_lookup_word( word )
        if( !clean_word ) return

        const cache_key = word_cache_key( clean_word, source_language, target_language )

        set_visible_word( { word: clean_word, cache_key } )
        lookup_word( clean_word )

        if( dismiss_timer_ref.current ) clearTimeout( dismiss_timer_ref.current )
    }, [ lookup_word, source_language, target_language ] )

    const handle_word_click = useCallback( ( e, word ) => {
        e.stopPropagation()

        const started_at = press_started_at_ref.current
        const elapsed_ms = started_at ? Date.now() - started_at : 0
        press_started_at_ref.current = null

        if( started_at && elapsed_ms > tap_max_ms ) return

        reveal_word( word )
    }, [ reveal_word, tap_max_ms ] )

    const visible_state = visible_word ? get_lookup_state( visible_word.word ) : null

    const hide_visible_word = useCallback( () => {
        if( dismiss_timer_ref.current ) clearTimeout( dismiss_timer_ref.current )
        set_visible_word( null )
    }, [] )

    useEffect( () => {
        if( dismiss_timer_ref.current ) clearTimeout( dismiss_timer_ref.current )
        if( !visible_word || visible_state?.loading ) return

        dismiss_timer_ref.current = setTimeout( hide_visible_word, TOOLTIP_DISMISS_MS )
    }, [
        visible_word,
        visible_state?.loading,
        visible_state?.content,
        visible_state?.error,
        visible_state?.can_lookup,
        hide_visible_word
    ] )

    useEffect( () => {
        if( !visible_word ) return

        const dismiss_on_outside_press = ( e ) => {
            const word_el = e.target.closest?.( `[data-word-tooltip-word]` )

            if( word_el && container_ref.current?.contains( word_el ) ) {
                const clean_word = clean_lookup_word( word_el.dataset.wordTooltipWord )
                const cache_key = word_cache_key( clean_word, source_language, target_language )
                if( cache_key === visible_word.cache_key ) return
            }

            hide_visible_word()
        }

        document.addEventListener( `pointerdown`, dismiss_on_outside_press, true )
        return () => document.removeEventListener( `pointerdown`, dismiss_on_outside_press, true )
    }, [ visible_word, source_language, target_language, hide_visible_word ] )

    useEffect( () => {
        return () => {
            if( dismiss_timer_ref.current ) clearTimeout( dismiss_timer_ref.current )
        }
    }, [] )

    if( !text ) return null

    const segments = text.split( /(\s+)/ ).map( ( segment, i ) => {
        if( !segment.trim() ) return segment

        const clean_word = clean_lookup_word( segment )
        if( !clean_word ) return segment

        const { cache_key, content, loading, error, can_lookup } = get_lookup_state( clean_word )
        const tooltip_content = !can_lookup || error ? LOOKUP_UNAVAILABLE : content

        return <Tooltip
            key={ `${ i }-${ cache_key }` }
            content={ tooltip_content }
            loading={ loading }
            force_visible={ visible_word?.cache_key === cache_key }
            hover_enabled={ false }
            fallback_content={ LOOKUP_UNAVAILABLE }
        >
            <TappableWord
                data-word-tooltip-word={ clean_word }
                onMouseDown={ remember_press_start }
                onTouchStart={ remember_press_start }
                onClick={ e => handle_word_click( e, segment ) }
            >
                { segment }
            </TappableWord>
        </Tooltip>
    } )

    return <span ref={ container_ref }>{ segments }</span>

}
