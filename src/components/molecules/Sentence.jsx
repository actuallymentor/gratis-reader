import { useState, useRef, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import Skeleton from '../atoms/Skeleton.jsx'
import WordTooltipText from './WordTooltipText.jsx'

const LONG_PRESS_MS = 600
const PRESS_MOVE_CANCEL_PX = 12
const CONTEXT_MENU_BLOCK_MS = 1_200
const TOUCH_CONTEXT_MENU_BLOCK_MS = LONG_PRESS_MS + CONTEXT_MENU_BLOCK_MS

const SentenceSpan = styled.span`
    position: relative;
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

const ExplainTooltip = styled.button`
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    transform: translateX(-50%);
    min-width: 72px;
    min-height: 40px;
    padding: var(--space-xs) var(--space-s);
    background: var(--text);
    color: var(--bg);
    border: 0;
    border-radius: var(--radius-s);
    box-shadow: var(--shadow);
    font: inherit;
    font-size: 0.8em;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    z-index: 120;

    &::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: var(--text);
    }
`

const event_point = ( e ) => {
    const touch = e.touches?.[0] || e.changedTouches?.[0]
    const x = touch ? touch.clientX : e.clientX
    const y = touch ? touch.clientY : e.clientY

    if( Number.isFinite( x ) && Number.isFinite( y ) ) return { x, y }
    return null
}

const is_touch_context_menu = ( e ) => 
    e.pointerType === `touch`
    || e.nativeEvent?.pointerType === `touch`
    || e.nativeEvent?.sourceCapabilities?.firesTouchEvents


/**
 * Interactive sentence — click words for tooltip, long-press for source-language meaning and explanation access.
 * @param {Object} props
 * @param {string} props.sentence_id
 * @param {string} props.original
 * @param {string} [props.translated]
 * @param {string} [props.meaning]
 * @param {boolean} [props.meaning_error]
 * @param {string} props.source_language
 * @param {string} props.target_language
 * @param {Function} [props.on_reveal_meaning] - Called when the source-language meaning is revealed
 * @param {Function} [props.on_long_press] - Called with sentence data on long-press
 */
export default function Sentence( {
    sentence_id,
    original,
    translated,
    meaning,
    meaning_error = false,
    source_language,
    target_language,
    on_reveal_meaning,
    on_long_press
} ) {

    const [ sentence_focus, set_sentence_focus ] = useState( {
        showing_meaning: false,
        explain_visible: false
    } )
    const explanation_timer_ref = useRef( null )
    const press_started_at_ref = useRef( null )
    const press_start_point_ref = useRef( null )
    const context_menu_blocked_until_ref = useRef( 0 )
    const showing_meaning_ref = useRef( false )

    const { showing_meaning, explain_visible } = sentence_focus
    const meaning_text = meaning_error ? `Meaning unavailable` : meaning || `...`
    const display_text = showing_meaning ? meaning_text : translated || original
    const is_translated = !!translated && !showing_meaning

    const clear_explanation_timer = useCallback( () => {
        if( explanation_timer_ref.current ) {
            clearTimeout( explanation_timer_ref.current )
            explanation_timer_ref.current = null
        }
    }, [] )

    const reset_press = useCallback( () => {
        clear_explanation_timer()
        press_started_at_ref.current = null
        press_start_point_ref.current = null
    }, [ clear_explanation_timer ] )

    const toggle_meaning_prompt = useCallback( () => {
        if( !translated ) return

        const next_showing_meaning = !showing_meaning_ref.current
        showing_meaning_ref.current = next_showing_meaning

        if( next_showing_meaning && on_reveal_meaning ) {
            on_reveal_meaning( { sentence_id, translated } )
        }

        set_sentence_focus( {
            showing_meaning: next_showing_meaning,
            explain_visible: next_showing_meaning
        } )
    }, [ sentence_id, translated, on_reveal_meaning ] )

    const handle_press_start = useCallback( ( e ) => {
        if( e.type === `mousedown` && e.button !== 0 ) return

        reset_press()

        const point = event_point( e )
        if( !point ) return

        // Mobile browsers can synthesize contextmenu before our long-press timer
        // fires, so touch presses block that route immediately.
        if( e.type === `touchstart` ) {
            context_menu_blocked_until_ref.current = Date.now() + TOUCH_CONTEXT_MENU_BLOCK_MS
        }

        press_started_at_ref.current = Date.now()
        press_start_point_ref.current = point

        if( translated ) {
            explanation_timer_ref.current = setTimeout( () => {
                context_menu_blocked_until_ref.current = Math.max(
                    context_menu_blocked_until_ref.current,
                    Date.now() + CONTEXT_MENU_BLOCK_MS
                )
                toggle_meaning_prompt()
            }, LONG_PRESS_MS )
        }
    }, [ translated, reset_press, toggle_meaning_prompt ] )

    const handle_press_move = useCallback( ( e ) => {
        if( !press_start_point_ref.current ) return

        const point = event_point( e )
        if( !point ) {
            clear_explanation_timer()
            return
        }

        const dx = Math.abs( point.x - press_start_point_ref.current.x )
        const dy = Math.abs( point.y - press_start_point_ref.current.y )

        if( dx > PRESS_MOVE_CANCEL_PX || dy > PRESS_MOVE_CANCEL_PX ) {
            clear_explanation_timer()
        }
    }, [ clear_explanation_timer ] )

    const handle_press_end = useCallback( () => {
        const started_at = press_started_at_ref.current
        if( !started_at ) return

        reset_press()
    }, [ reset_press ] )

    const open_explanation = useCallback( ( e ) => {
        e.preventDefault()
        e.stopPropagation()

        if( on_long_press && translated ) {
            on_long_press( { sentence_id, original, translated } )
        }
    }, [ sentence_id, original, translated, on_long_press ] )

    const stop_explain_interaction = useCallback( ( e ) => {
        e.stopPropagation()
    }, [] )

    const handle_context_menu = useCallback( ( e ) => {
        if( is_touch_context_menu( e ) || Date.now() < context_menu_blocked_until_ref.current ) {
            e.preventDefault()
            return
        }

        if( on_long_press && translated ) {
            e.preventDefault()
            on_long_press( { sentence_id, original, translated } )
        }
    }, [ sentence_id, original, translated, on_long_press ] )

    // Clean up timers on unmount
    useEffect( () => {
        return reset_press
    }, [ reset_press ] )

    useEffect( () => {
        showing_meaning_ref.current = showing_meaning
    }, [ showing_meaning ] )

    useEffect( () => {
        set_sentence_focus( {
            showing_meaning: false,
            explain_visible: false
        } )
        showing_meaning_ref.current = false
    }, [ sentence_id, translated ] )

    // If no text at all, show skeleton
    if( !original ) return <Skeleton width="80%" height="1.2em" />

    // Render target-language words with click tooltips.
    const render_words = () => {
        if( !is_translated ) return display_text

        return <WordTooltipText
            text={ display_text }
            source_language={ source_language }
            target_language={ target_language }
            sentence_context={ display_text }
            click_max_ms={ LONG_PRESS_MS }
        />
    }

    return <SentenceSpan
        data-sentence-id={ sentence_id }
        $highlighted={ showing_meaning }
        onMouseDown={ handle_press_start }
        onMouseUp={ handle_press_end }
        onMouseMove={ handle_press_move }
        onMouseLeave={ reset_press }
        onTouchStart={ handle_press_start }
        onTouchEnd={ handle_press_end }
        onTouchMove={ handle_press_move }
        onTouchCancel={ reset_press }
        onContextMenu={ handle_context_menu }
    >
        { render_words() }
        { explain_visible && <ExplainTooltip
            type="button"
            onMouseDown={ stop_explain_interaction }
            onTouchStart={ stop_explain_interaction }
            onClick={ open_explanation }
        >
            Explain
        </ExplainTooltip> }
    </SentenceSpan>

}
