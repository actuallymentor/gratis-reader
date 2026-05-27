import { useState, useRef, useCallback, useEffect, useId } from 'react'
import styled from 'styled-components'
import Tooltip from '../atoms/Tooltip.jsx'
import { clean_lookup_word, word_cache_key, use_word_lookup } from '../../hooks/use_word_lookup.js'

const CLICK_MAX_MS = 300
const LOOKUP_UNAVAILABLE = `Lookup unavailable`

const ClickableWord = styled.span`
    cursor: pointer;
    border-radius: 2px;

    &:hover {
        color: var(--accent-dark);
    }
`

/**
 * Renders target-language text where clicking any word shows its source-language equivalent.
 * @param {Object} props
 * @param {string} props.text
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @param {string} [props.sentence_context]
 * @param {number} [props.click_max_ms]
 */
export default function WordTooltipText( {
    text,
    source_language,
    target_language,
    sentence_context,
    click_max_ms = CLICK_MAX_MS
} ) {

    const [ visible_tooltips, set_visible_tooltips ] = useState( {} )
    const tooltip_group_id = useId()
    const press_started_at_ref = useRef( null )
    const { lookup_word, get_lookup_state } = use_word_lookup( {
        source_language,
        target_language,
        sentence_context: sentence_context || text
    } )

    const remember_press_start = useCallback( () => {
        press_started_at_ref.current = Date.now()
    }, [] )

    const reveal_word = useCallback( ( word, tooltip_key ) => {
        const clean_word = clean_lookup_word( word )
        if( !clean_word ) return

        const cache_key = word_cache_key( clean_word, source_language, target_language )

        set_visible_tooltips( visible => {
            if( visible[tooltip_key] ) return visible

            return {
                ...visible,
                [tooltip_key]: { word: clean_word, cache_key }
            }
        } )
        lookup_word( clean_word )
    }, [ lookup_word, source_language, target_language ] )

    const dismiss_tooltip = useCallback( ( tooltip_key ) => {
        set_visible_tooltips( visible => {
            if( !visible[tooltip_key] ) return visible

            const next_visible = { ...visible }
            delete next_visible[tooltip_key]
            return next_visible
        } )
    }, [] )

    const handle_word_click = useCallback( ( e, word, tooltip_key ) => {
        e.stopPropagation()

        const started_at = press_started_at_ref.current
        const elapsed_ms = started_at ? Date.now() - started_at : 0
        press_started_at_ref.current = null

        if( started_at && elapsed_ms > click_max_ms ) return

        reveal_word( word, tooltip_key )
    }, [ reveal_word, click_max_ms ] )

    useEffect( () => {
        set_visible_tooltips( {} )
    }, [ text, source_language, target_language ] )

    if( !text ) return null

    const segments = text.split( /(\s+)/ ).map( ( segment, i ) => {
        if( !segment.trim() ) return segment

        const clean_word = clean_lookup_word( segment )
        if( !clean_word ) return segment

        const { cache_key, content, loading, error, can_lookup } = get_lookup_state( clean_word )
        const tooltip_content = !can_lookup || error ? LOOKUP_UNAVAILABLE : content
        const tooltip_key = `${ i }-${ cache_key }`

        return <Tooltip
            key={ tooltip_key }
            content={ tooltip_content }
            loading={ loading }
            force_visible={ !!visible_tooltips[tooltip_key] }
            hover_enabled={ false }
            fallback_content={ LOOKUP_UNAVAILABLE }
            on_dismiss={ () => dismiss_tooltip( tooltip_key ) }
        >
            <ClickableWord
                data-word-tooltip-word={ clean_word }
                data-word-tooltip-group={ tooltip_group_id }
                onMouseDown={ remember_press_start }
                onTouchStart={ remember_press_start }
                onClick={ e => handle_word_click( e, segment, tooltip_key ) }
            >
                { segment }
            </ClickableWord>
        </Tooltip>
    } )

    return segments

}
