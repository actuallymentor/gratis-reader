import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'

const viewport_gap = 12
const word_gap = 8

const arrow_offset = ( offset = 0 ) =>
    `${ offset < 0 ? `-` : `+` } ${ Math.abs( offset ) }px`

const Tooltip = styled.span`
    position: fixed;
    top: ${ p => p.$y }px;
    left: ${ p => p.$x }px;
    z-index: 100;
    width: max-content;
    max-width: min(16rem, calc(100vw - var(--space-xl)));
    padding: var(--space-xs) var(--space-s);
    transform: translateX(-50%);
    border: 1px solid var(--text);
    border-radius: var(--radius-s);
    background: var(--text);
    color: var(--bg);
    font-size: 0.8rem;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
    pointer-events: none;
    text-align: center;
    visibility: ${ p => p.$positioned ? `visible` : `hidden` };

    &::after {
        content: '';
        position: absolute;
        top: ${ p => p.$below ? `auto` : `100%` };
        bottom: ${ p => p.$below ? `100%` : `auto` };
        left: clamp( 8px, calc( 50% ${ p => arrow_offset( p.$arrow_offset ) } ), calc( 100% - 8px ) );
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: ${ p => p.$below ? `transparent` : `var(--text)` };
        border-bottom-color: ${ p => p.$below ? `var(--text)` : `transparent` };
    }
`

const clamp = ( value, minimum, maximum ) => Math.min( maximum, Math.max( minimum, value ) )

const visible_anchor_rect = ( anchor ) => Array.from( anchor.getClientRects() ).find( rect => {
    if( rect.bottom <= 0 || rect.top >= window.innerHeight ) return false

    const element_at_anchor = document.elementFromPoint?.(
        clamp( rect.left + rect.width / 2, 0, window.innerWidth - 1 ),
        clamp( rect.top + rect.height / 2, 0, window.innerHeight - 1 )
    )

    return !element_at_anchor
        || element_at_anchor === anchor
        || anchor.contains( element_at_anchor )
        || element_at_anchor.contains( anchor )
} )

/**
 * Shows one viewport-safe translation bubble above a selected reader word.
 * @param {Object} props
 * @param {Object} props.anchor_ref - Ref for the selected translated word
 * @param {number} props.anchor_key - Changes whenever a different word owns the tooltip
 * @param {string} props.id - Tooltip id referenced by the selected word
 * @param {string} props.content - Contextual source-language translation
 * @returns {React.ReactPortal|null}
 */
export default function ReaderWordTooltip( { anchor_ref, anchor_key, id, content } ) {

    const tooltip_ref = useRef( null )
    const [ position, set_position ] = useState( {
        x: 0,
        y: 0,
        arrow_offset: 0,
        below: false,
        positioned: false
    } )

    useLayoutEffect( () => {
        const tooltip = tooltip_ref.current
        const anchor = anchor_ref.current
        if( !tooltip || !anchor ) return

        const position_tooltip = () => {
            const anchor_rect = visible_anchor_rect( anchor )

            // A fixed bubble should not detach from its word over sticky reader chrome.
            if( !anchor_rect ) {
                set_position( current => current.positioned
                    ? { ...current, positioned: false }
                    : current )
                return
            }

            const tooltip_width = tooltip.offsetWidth
            const tooltip_height = tooltip.offsetHeight
            const tooltip_half_width = Math.min(
                tooltip_width / 2,
                Math.max( 0, ( window.innerWidth - viewport_gap * 2 ) / 2 )
            )
            const anchor_center = anchor_rect.left + anchor_rect.width / 2
            const x = clamp(
                anchor_center,
                viewport_gap + tooltip_half_width,
                window.innerWidth - viewport_gap - tooltip_half_width
            )
            const space_above = anchor_rect.top - word_gap - viewport_gap
            const space_below = window.innerHeight - anchor_rect.bottom - word_gap - viewport_gap
            const below = space_above < tooltip_height && space_below > space_above
            const preferred_y = below
                ? anchor_rect.bottom + word_gap
                : anchor_rect.top - word_gap - tooltip_height
            const maximum_y = Math.max(
                viewport_gap,
                window.innerHeight - viewport_gap - tooltip_height
            )
            const next_position = {
                x,
                y: clamp( preferred_y, viewport_gap, maximum_y ),
                arrow_offset: anchor_center - x,
                below,
                positioned: true
            }

            set_position( current => Object.keys( next_position ).every(
                key => current[key] === next_position[key]
            ) ? current : next_position )
        }

        position_tooltip()

        let animation_frame = null
        const schedule_position = () => {
            if( animation_frame !== null ) return

            animation_frame = requestAnimationFrame( () => {
                animation_frame = null
                position_tooltip()
            } )
        }

        const observer = typeof ResizeObserver === `undefined`
            ? null
            : new ResizeObserver( schedule_position )
        const reader_dock = document.querySelector( `[data-reader-dock]` )

        observer?.observe( anchor )
        observer?.observe( tooltip )
        if( reader_dock ) observer?.observe( reader_dock )
        window.addEventListener( `resize`, schedule_position )
        window.addEventListener( `scroll`, schedule_position, true )

        return () => {
            observer?.disconnect()
            if( animation_frame !== null ) cancelAnimationFrame( animation_frame )
            window.removeEventListener( `resize`, schedule_position )
            window.removeEventListener( `scroll`, schedule_position, true )
        }
    }, [ anchor_ref, anchor_key, content ] )

    if( typeof document === `undefined` ) return null

    return createPortal( <Tooltip
        ref={ tooltip_ref }
        id={ id }
        role="tooltip"
        data-reader-word-tooltip
        $x={ position.x }
        $y={ position.y }
        $arrow_offset={ position.arrow_offset }
        $below={ position.below }
        $positioned={ position.positioned }
    >
        { content }
    </Tooltip>, document.body )

}
