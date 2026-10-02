import { useCallback, useEffect, useId, useRef } from 'react'
import styled, { css } from 'styled-components'
import { X } from 'lucide-react'
import { IconButton } from './Button.jsx'

const EXIT_MS = 200

const variants = {
    center: css`
        width: min(calc(100% - 2rem), var(--modal-width, 32rem));
        max-height: calc(100dvh - 2rem);
        margin: auto;
        border-radius: var(--radius-l);
    `,
    drawer: css`
        width: min(100%, 26rem);
        height: 100dvh;
        max-height: 100dvh;
        margin: 0 0 0 auto;
        border-radius: 0;
        --modal-rise: translateX(8px);
    `
}

const Dialog = styled.dialog`
    --modal-rise: translateY(8px);
    padding: 0;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    color: var(--text);
    box-shadow: var(--shadow-l);
    overflow: auto;
    overscroll-behavior: contain;

    ${ p => variants[p.$variant] }

    &::backdrop { background: var(--overlay); }

    /* 500ms rise and fade in, 200ms out */
    &[open] { animation: modal-in 500ms var(--ease-out); }
    &[open]::backdrop { animation: backdrop-in 500ms var(--ease-out); }
    &[data-closing="true"] { animation: modal-out ${ EXIT_MS }ms ease-in forwards; }
    &[data-closing="true"]::backdrop { animation: backdrop-out ${ EXIT_MS }ms ease-in forwards; }

    @keyframes modal-in { from { opacity: 0; transform: var(--modal-rise); } }
    @keyframes modal-out { to { opacity: 0; transform: var(--modal-rise); } }
    @keyframes backdrop-in { from { opacity: 0; } }
    @keyframes backdrop-out { to { opacity: 0; } }
`

const Header = styled.div`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-m);
    padding: var(--space-l) var(--space-l) 0;
`

const Title = styled.h2`
    font-size: 1.625rem;
    line-height: 1.25;
`

const Body = styled.div`
    padding: var(--space-m) var(--space-l) var(--space-l);
`

/**
 * Accessible modal on a native <dialog>: the page behind is inert, Escape and the backdrop
 * close it, focus moves inside on open and returns to the opener on close.
 * The modal is open while mounted; closing animates out, then calls on_close.
 * @param {Object} props
 * @param {string} props.title - Visible heading and accessible name
 * @param {Function} [props.on_close] - Omit to make the modal undismissable (no close button, Escape or backdrop)
 * @param {'center'|'drawer'} [props.variant=center]
 * @param {string} [props.width] - Max width of a centred modal
 * @param {React.ReactNode} [props.header_actions] - Extra icon buttons beside the close button
 * @param {Function} [props.close_ref] - Receives a function that closes with the exit animation
 */
export default function Modal( { title, on_close, variant = `center`, width, header_actions, close_ref, children, ...rest } ) {

    const dialog_ref = useRef( null )
    const opener_ref = useRef( null )
    const closing_ref = useRef( false )
    const title_id = useId()

    const request_close = useCallback( () => {
        const dialog = dialog_ref.current
        if( !on_close || !dialog || closing_ref.current ) return
        closing_ref.current = true
        dialog.dataset.closing = `true`
        setTimeout( () => {
            dialog.close()
            on_close()
        }, window.matchMedia?.( `(prefers-reduced-motion: reduce)` ).matches ? 0 : EXIT_MS )
    }, [ on_close ] )

    useEffect( () => {
        if( close_ref ) close_ref( request_close )
    }, [ close_ref, request_close ] )

    useEffect( () => {
        const dialog = dialog_ref.current
        opener_ref.current = document.activeElement
        if( !dialog.open ) dialog.showModal()

        // React's autoFocus cannot reach into a closed <dialog>, and the browser would pick the
        // first focusable element (often a text field that opens the phone keyboard). Focus
        // the marked element, else the close button.
        const target = dialog.querySelector( `[data-autofocus]` ) || dialog.querySelector( `[data-modal-close]` )
        target?.focus()

        return () => {
            if( dialog.open ) dialog.close()
            // Unmounting skips the browser's own focus restoration
            const opener = opener_ref.current
            if( opener?.isConnected && typeof opener.focus === `function` ) opener.focus()
        }
    }, [] )

    // Escape arrives as a cancel event: animate out instead of an abrupt close. React bubbles
    // a nested dialog's cancel to this one, so only react to our own.
    const on_cancel = ( e ) => {
        if( e.target !== dialog_ref.current ) return
        e.preventDefault()
        request_close()
    }

    // Only a click outside the dialog's box is a backdrop click; empty space inside it is not
    const on_click = ( e ) => {
        if( e.target !== dialog_ref.current ) return
        const box = dialog_ref.current.getBoundingClientRect()
        const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom
        if( outside ) request_close()
    }

    return <Dialog
        ref={ dialog_ref }
        $variant={ variant }
        aria-labelledby={ title_id }
        style={ width ? { '--modal-width': width } : undefined }
        onCancel={ on_cancel }
        onClick={ on_click }
        { ...rest }
    >
        <Header>
            <Title id={ title_id }>{ title }</Title>
            <div style={ { display: `flex`, gap: `var(--space-xs)` } }>
                { header_actions }
                { on_close && <IconButton label="Close" data-modal-close icon={ <X strokeWidth={ 1.5 } /> } onClick={ request_close } /> }
            </div>
        </Header>
        <Body>{ children }</Body>
    </Dialog>

}
