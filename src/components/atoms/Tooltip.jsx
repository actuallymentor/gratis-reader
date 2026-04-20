import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'

const TooltipContainer = styled.div`
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    padding: var(--space-xs) var(--space-s);
    background: var(--text);
    color: var(--bg);
    border-radius: var(--radius-s);
    font-size: 0.8em;
    white-space: nowrap;
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    z-index: 100;
    opacity: ${ p => p.$visible ? 1 : 0 };
    transition: opacity 0.15s ease;

    /* Prevent overflow on narrow viewports */
    @media (max-width: 480px) {
        max-width: 200px;
        white-space: normal;
        word-break: break-word;
    }

    /* Arrow */
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

const Wrapper = styled.span`
    position: relative;
    display: inline;
`

/**
 * Word hover tooltip — shows content above the child element on hover
 * @param {Object} props
 * @param {React.ReactNode} props.children
 * @param {string} props.content - Text to show in tooltip
 * @param {boolean} [props.loading] - Show loading indicator
 * @param {boolean} [props.force_visible] - Force tooltip open (for mobile touch)
 */
export default function Tooltip( { children, content, loading, force_visible } ) {

    const [ visible, set_visible ] = useState( false )
    const timeout_ref = useRef( null )

    const show = () => {
        clearTimeout( timeout_ref.current )
        set_visible( true )
    }

    const hide = () => {
        timeout_ref.current = setTimeout( () => set_visible( false ), 100 )
    }

    // Show tooltip when forced by parent (mobile touch-and-hold)
    useEffect( () => {
        if( force_visible ) {
            set_visible( true )
        }
    }, [ force_visible ] )

    useEffect( () => {
        return () => clearTimeout( timeout_ref.current )
    }, [] )

    return <Wrapper
        onMouseEnter={ show }
        onMouseLeave={ hide }
    >
        { children }
        { visible && <TooltipContainer $visible={ visible }>
            { loading ? `...` :  content || `...`  }
        </TooltipContainer> }
    </Wrapper>

}
