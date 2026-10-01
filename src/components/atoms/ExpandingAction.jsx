import { forwardRef, useRef, useState } from 'react'
import styled from 'styled-components'
import { ButtonBase } from './Button.jsx'

const LONG_PRESS_MS = 450
// A label revealed by long press stays readable for a moment after the finger lifts
const REVEAL_HOLD_MS = 3_000

const Face = styled( ButtonBase )`
    gap: 0;
    padding: 0.2rem 0.5rem;

    .label {
        display: inline-block;
        max-width: 0;
        overflow: hidden;
        opacity: 0;
        transition: max-width 240ms var(--ease-out), opacity 240ms var(--ease-out), margin 240ms var(--ease-out);
    }

    /* Hover (on devices that really hover), keyboard focus or a long press reveals the label */
    &:focus-visible .label, &[data-revealed="true"] .label {
        max-width: 12rem;
        opacity: 1;
        margin-left: 0.4em;
    }

    @media (hover: hover) {
        &:hover .label {
            max-width: 12rem;
            opacity: 1;
            margin-left: 0.4em;
        }
    }
`

/**
 * Compact item action: an icon that expands to icon + label on hover or focus. On touch, a
 * long press reveals the label without activating; a separate tap activates.
 * The label stays in the DOM, so it is always the accessible name.
 * @param {Object} props
 * @param {React.ReactNode} props.icon
 * @param {string} props.label
 * @param {Function} props.onClick
 * @param {'secondary'|'quiet'|'danger'} [props.variant=quiet]
 */
const ExpandingAction = forwardRef( ( { icon, label, onClick, variant = `quiet`, ...rest }, ref ) => {

    const [ revealed, set_revealed ] = useState( false )
    const press_ref = useRef( { timer: null, long: false, x: 0, y: 0 } )

    const cancel_press = () => {
        clearTimeout( press_ref.current.timer )
        press_ref.current.timer = null
    }

    const on_pointer_down = ( e ) => {
        if( e.pointerType !== `touch` ) return
        press_ref.current = { timer: null, long: false, x: e.clientX, y: e.clientY }
        press_ref.current.timer = setTimeout( () => {
            press_ref.current.long = true
            set_revealed( true )
            setTimeout( () => set_revealed( false ), REVEAL_HOLD_MS )
        }, LONG_PRESS_MS )
    }

    // Scrolling cancels a long press
    const on_pointer_move = ( e ) => {
        if( !press_ref.current.timer ) return
        if( Math.hypot( e.clientX - press_ref.current.x, e.clientY - press_ref.current.y ) > 10 ) cancel_press()
    }

    const on_click = ( e ) => {
        cancel_press()
        // Releasing a long press only reveals; it never activates
        if( press_ref.current.long ) {
            press_ref.current.long = false
            e.preventDefault()
            return
        }
        set_revealed( false )
        onClick?.( e )
    }

    return <Face
        ref={ ref }
        type="button"
        $variant={ variant }
        data-revealed={ revealed }
        onPointerDown={ on_pointer_down }
        onPointerMove={ on_pointer_move }
        onPointerUp={ cancel_press }
        onPointerCancel={ cancel_press }
        onPointerLeave={ e => {
            cancel_press()
            // Touch pointers "leave" on lift; only a mouse leaving hides the label
            if( e.pointerType !== `touch` ) set_revealed( false )
        } }
        onContextMenu={ e => press_ref.current.long && e.preventDefault() }
        onClick={ on_click }
        { ...rest }
    >
        { icon }
        <span className="label">{ label }</span>
    </Face>

} )

export default ExpandingAction
