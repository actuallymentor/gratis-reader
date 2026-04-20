import { useState, useRef, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import Tooltip from '../atoms/Tooltip.jsx'
import { chat_completion } from '../../modules/open_router.js'
import { build_word_lookup_prompt } from '../../modules/prompts.js'
import { use_settings_store } from '../../stores/settings_store.js'
import { use_cache } from '../../hooks/use_cache.js'
import Skeleton from '../atoms/Skeleton.jsx'

const SentenceSpan = styled.span`
    cursor: pointer;
    transition: background-color 0.2s ease;
    border-radius: 2px;
    padding: 1px 0;

    ${ p => p.$highlighted && `
        background-color: var(--accent-light);
    ` }

    ${ p => p.$is_skeleton && `
        cursor: default;
    ` }

    &:hover {
        background-color: ${ p => p.$highlighted ? `var(--accent-light)` : `var(--bg-hover)` };
    }
`

const HoverableWord = styled.span`
    position: relative;
    display: inline;

    &:hover {
        color: var(--accent-dark);
    }
`

/**
 * Interactive sentence — tap to toggle, hover words for tooltip, long-press for explanation
 * @param {Object} props
 * @param {string} props.sentence_id
 * @param {string} props.original
 * @param {string} [props.translated]
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @param {Function} [props.on_long_press] - Called with sentence data on long-press
 */
export default function Sentence( { sentence_id, original, translated, source_language, target_language, on_long_press } ) {

    const [ showing_original, set_showing_original ] = useState( false )
    const [ word_translations, set_word_translations ] = useState( {} )
    const [ loading_words, set_loading_words ] = useState( {} )
    const long_press_ref = useRef( null )
    const suppressed_ref = useRef( false )
    const word_abort_ref = useRef( null )
    const api_key = use_settings_store( state => state.api_key )
    const model = use_settings_store( state => state.model )
    const { get_word_translation, cache_word_translation } = use_cache()

    const display_text = showing_original ? original :  translated || original 
    const is_translated = !!translated && !showing_original

    // Tap to toggle
    const handle_click = useCallback( () => {
        if( suppressed_ref.current ) {
            suppressed_ref.current = false
            return
        }
        if( translated ) set_showing_original( prev => !prev )
    }, [ translated ] )

    // Long-press handling
    const handle_press_start = useCallback( ( e ) => {
        suppressed_ref.current = false
        long_press_ref.current = setTimeout( () => {
            suppressed_ref.current = true
            if( on_long_press ) {
                on_long_press( { sentence_id, original, translated } )
            }
        }, 500 )
    }, [ sentence_id, original, translated, on_long_press ] )

    const handle_press_end = useCallback( () => {
        if( long_press_ref.current ) {
            clearTimeout( long_press_ref.current )
            long_press_ref.current = null
        }
    }, [] )

    // Right-click opens explanation
    const handle_context_menu = useCallback( ( e ) => {
        if( on_long_press && translated ) {
            e.preventDefault()
            on_long_press( { sentence_id, original, translated } )
        }
    }, [ sentence_id, original, translated, on_long_press ] )

    // Word hover translation lookup
    const lookup_word = useCallback( async ( word ) => {

        if( !word.trim() || !api_key ) return

        const clean_word = word.replace( /[.,!?;:'"()[\]{}]/g, `` ).trim()
        if( !clean_word ) return

        const cache_key = `${ clean_word.toLowerCase() }:${ source_language }:${ target_language }`

        // Check if already loaded or loading
        if( word_translations[cache_key] || loading_words[cache_key] ) return

        // Check IndexedDB cache
        const cached = await get_word_translation( clean_word, source_language, target_language )
        if( cached ) {
            set_word_translations( prev => ( { ...prev, [cache_key]: cached } ) )
            return
        }

        // Fetch from API — cancel any previous in-flight word lookup
        if( word_abort_ref.current ) word_abort_ref.current.abort()
        const controller = new AbortController()
        word_abort_ref.current = controller

        set_loading_words( prev => ( { ...prev, [cache_key]: true } ) )

        try {
            const { system, user } = build_word_lookup_prompt( clean_word, source_language, target_language, display_text )
            const { content } = await chat_completion( {
                api_key, model, system_prompt: system, user_message: user, temperature: 0.1, signal: controller.signal
            } )
            set_word_translations( prev => ( { ...prev, [cache_key]: content } ) )
            await cache_word_translation( clean_word, source_language, target_language, content )
        } catch {
            // Silently fail for word lookups
        } finally {
            set_loading_words( prev => ( { ...prev, [cache_key]: false } ) )
        }

    }, [ api_key, model, source_language, target_language, display_text, word_translations, loading_words, get_word_translation, cache_word_translation ] )

    // Word touch-and-hold for mobile (triggers word lookup on brief hold)
    const word_touch_ref = useRef( null )
    const [ touched_word, set_touched_word ] = useState( null )

    const handle_word_touch_start = useCallback( ( word ) => {
        word_touch_ref.current = setTimeout( () => {
            const clean = word.replace( /[.,!?;:'"()[\]{}]/g, `` ).toLowerCase()
            set_touched_word( `${ clean }:${ source_language }:${ target_language }` )
            lookup_word( word )
        }, 300 )
    }, [ lookup_word, source_language, target_language ] )

    const dismiss_timer_ref = useRef( null )

    const handle_word_touch_end = useCallback( () => {
        if( word_touch_ref.current ) {
            clearTimeout( word_touch_ref.current )
            word_touch_ref.current = null
        }
        // Dismiss after short delay so user can read the tooltip
        if( dismiss_timer_ref.current ) clearTimeout( dismiss_timer_ref.current )
        dismiss_timer_ref.current = setTimeout( () => set_touched_word( null ), 2000 )
    }, [] )

    // Clean up timers and in-flight requests on unmount
    useEffect( () => {
        return () => {
            if( long_press_ref.current ) clearTimeout( long_press_ref.current )
            if( word_touch_ref.current ) clearTimeout( word_touch_ref.current )
            if( dismiss_timer_ref.current ) clearTimeout( dismiss_timer_ref.current )
            if( word_abort_ref.current ) word_abort_ref.current.abort()
        }
    }, [] )

    // If no text at all, show skeleton
    if( !original ) return <Skeleton width="80%" height="1.2em" />

    // Render words with hover/touch tooltips (translated text only)
    const render_words = () => {
        if( !is_translated ) return display_text

        return display_text.split( /(\s+)/ ).map( ( segment, i ) => {
            if( !segment.trim() ) return segment

            const clean = segment.replace( /[.,!?;:'"()[\]{}]/g, `` ).toLowerCase()
            const cache_key = `${ clean }:${ source_language }:${ target_language }`
            const word_translation = word_translations[cache_key]
            const is_loading = loading_words[cache_key]

            return <Tooltip
                key={ i }
                content={ word_translation }
                loading={ is_loading }
                force_visible={ touched_word === cache_key }
            >
                <HoverableWord
                    onMouseEnter={ () => lookup_word( segment ) }
                    onTouchStart={ () => handle_word_touch_start( segment ) }
                    onTouchEnd={ handle_word_touch_end }
                >
                    { segment }
                </HoverableWord>
            </Tooltip>
        } )
    }

    return <SentenceSpan
        data-sentence-id={ sentence_id }
        $highlighted={ showing_original }
        onClick={ handle_click }
        onMouseDown={ handle_press_start }
        onMouseUp={ handle_press_end }
        onMouseLeave={ handle_press_end }
        onTouchStart={ handle_press_start }
        onTouchEnd={ handle_press_end }
        onContextMenu={ handle_context_menu }
    >
        { render_words() }
    </SentenceSpan>

}
