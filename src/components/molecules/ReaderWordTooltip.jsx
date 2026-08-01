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
    transform: translate(-50%, -100%);
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
        top: 100%;
        left: clamp( 8px, calc( 50% ${ p => arrow_offset( p.$arrow_offset ) } ), calc( 100% - 8px ) );
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: var(--text);
    }
`

const clamp = ( value, minimum, maximum ) => Math.min( maximum, Math.max( minimum, value ) )

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
    const [ position, set_position ] = useState( { x: 0, y: 0, arrow_offset: 0, positioned: false } )

    useLayoutEffect( () => {
        const tooltip = tooltip_ref.current
        const anchor = anchor_ref.current
        if( !tooltip || !anchor ) return

        const position_tooltip = () => {
            const anchor_rect = anchor.getBoundingClientRect()
            const tooltip_width = tooltip.offsetWidth
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
            const next_position = {
                x,
                y: anchor_rect.top - word_gap,
                arrow_offset: anchor_center - x,
                positioned: true
            }

            set_position( current => Object.keys( next_position ).every(
                key => current[key] === next_position[key]
            ) ? current : next_position )
        }

        position_tooltip()

        const observer = typeof ResizeObserver === `undefined`
            ? null
            : new ResizeObserver( position_tooltip )

        observer?.observe( anchor )
        observer?.observe( tooltip )
        window.addEventListener( `resize`, position_tooltip )
        window.addEventListener( `scroll`, position_tooltip, true )

        return () => {
            observer?.disconnect()
            window.removeEventListener( `resize`, position_tooltip )
            window.removeEventListener( `scroll`, position_tooltip, true )
        }
    }, [ anchor_ref, anchor_key, content ] )

    if( typeof document === `undefined` ) return null

    return createPortal( <Tooltip
        ref={ tooltip_ref }
        id={ id }
        role="tooltip"
        aria-live="polite"
        data-reader-word-tooltip
        $x={ position.x }
        $y={ position.y }
        $arrow_offset={ position.arrow_offset }
        $positioned={ position.positioned }
    >
        { content }
    </Tooltip>, document.body )

}
