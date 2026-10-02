import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { AlertTriangle, RotateCw } from 'lucide-react'
import Modal from '../atoms/Modal.jsx'
import { Button } from '../atoms/Button.jsx'

const Notice = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-s) var(--space-m);
    padding: var(--space-m);
    border: 1px solid var(--border);
    border-radius: var(--radius-m);
    background: var(--warning-tint);
    color: var(--warning-text);

    svg { width: 1rem; height: 1rem; flex-shrink: 0; }
    span { flex: 1; min-width: 12rem; }
`

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: var(--space-s);
    margin-top: var(--space-l);
`

/**
 * Failed load: a modal offering retry or close; after closing, an inline notice keeps
 * retry available. Renders nothing while `error` is empty.
 * @param {Object} props
 * @param {string|null} props.error - Explanation shown to the reader
 * @param {string} props.title - e.g. "Couldn't load the classic library"
 * @param {Function} props.on_retry
 */
export default function LoadError( { error, title, on_retry } ) {

    const [ dismissed, set_dismissed ] = useState( false )
    const close_ref = useRef( null )

    // A new failure gets its own modal
    useEffect( () => {
        if( error ) set_dismissed( false )
    }, [ error ] )

    if( !error ) return null

    // From the modal: animate out (its on_close dismisses it), then reload
    const retry = () => {
        if( close_ref.current ) close_ref.current()
        else set_dismissed( true )
        on_retry()
    }

    return <>
        { dismissed && <Notice role="status">
            <AlertTriangle strokeWidth={ 1.5 } aria-hidden="true" />
            <span>{ title }. { error }</span>
            <Button icon={ <RotateCw strokeWidth={ 1.5 } /> } onClick={ retry }>Retry</Button>
        </Notice> }
        { !dismissed && <Modal
            title={ title }
            width="28rem"
            close_ref={ fn => {
                close_ref.current = fn
            } }
            on_close={ () => {
                close_ref.current = null
                set_dismissed( true )
            } }
        >
            <p>{ error }</p>
            <Actions>
                <Button onClick={ () => close_ref.current?.() }>Close</Button>
                <Button variant="primary" data-autofocus icon={ <RotateCw strokeWidth={ 1.5 } /> } onClick={ retry }>Retry</Button>
            </Actions>
        </Modal> }
    </>

}
